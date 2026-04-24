// Generates AI-tailored CV tweaks for a specific application,
// based on the user's CV template + the job description.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYS = `Du tilpasser en CV-mal til en spesifikk stilling. Vær ærlig — ikke finn på erfaring. Foreslå:
- En tilpasset intro (2-4 linjer) som kobler kandidatens bakgrunn til stillingens behov
- Hvilke erfaringer/prosjekter som bør fremheves (titler fra mal-en)
- Hvilke som bør tones ned eller hoppes over
- Hvilke ferdigheter som bør prioriteres øverst
- Konkrete omformuleringsforslag (gammel tekst -> ny tekst) for utvalgte erfaringspunkter
- En komplett tilpasset CV i markdown, klar til eksport

Svar på norsk. Bruk kun informasjon fra mal-en.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Mangler auth" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) return json({ error: "Ikke autentisert" }, 401);

    const { applicationId } = await req.json();
    if (!applicationId) return json({ error: "applicationId påkrevd" }, 400);

    const [{ data: app }, { data: cv }, { data: profile }] = await Promise.all([
      supabase.from("applications").select("*, jobs(*)").eq("id", applicationId).maybeSingle(),
      supabase.from("cv_templates").select("*").eq("user_id", user.id).eq("is_active", true).maybeSingle(),
      supabase.from("profiles").select("master_profile, style_guide").eq("user_id", user.id).maybeSingle(),
    ]);
    if (!app) return json({ error: "Søknad ikke funnet" }, 404);
    if (!cv) return json({ error: "Du må opprette en CV-mal først." }, 400);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY mangler" }, 500);

    const ctx = `CV-MAL (JSON):\n${JSON.stringify(cv, null, 2)}\n\nMASTER-PROFIL:\n${profile?.master_profile ?? ""}\n\nSTIL-GUIDE:\n${profile?.style_guide ?? ""}\n\nSTILLING:\nTittel: ${app.jobs.title}\nSelskap: ${app.jobs.company ?? ""}\nBeskrivelse:\n${app.jobs.description ?? ""}\nAI-oppsummering: ${app.jobs.ai_summary ?? ""}`;

    const tool = {
      type: "function",
      function: {
        name: "tailor_cv",
        parameters: {
          type: "object",
          properties: {
            tailored_intro: { type: "string", description: "2-4 linjer norsk tekst" },
            highlight_experiences: { type: "array", items: { type: "string" }, description: "Titler fra mal-ens experiences som bør fremheves" },
            deemphasize: { type: "array", items: { type: "string" }, description: "Titler som bør tones ned" },
            prioritize_skills: { type: "array", items: { type: "string" } },
            rephrase_suggestions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  context: { type: "string", description: "Hvor i CV-en (f.eks. 'Erfaring: Tomra')" },
                  before: { type: "string" },
                  after: { type: "string" },
                },
                required: ["context", "before", "after"],
              },
            },
            tailored_cv_markdown: { type: "string", description: "Komplett CV i markdown med tilpasninger anvendt" },
            notes: { type: "string", description: "Korte begrunnelser for valgene" },
          },
          required: ["tailored_intro", "highlight_experiences", "deemphasize", "prioritize_skills", "rephrase_suggestions", "tailored_cv_markdown"],
        },
      },
    };

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYS },
          { role: "user", content: ctx },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "tailor_cv" } },
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) return json({ error: "AI rate limit. Prøv igjen om litt." }, 429);
      if (aiResp.status === 402) return json({ error: "AI-kreditter brukt opp." }, 402);
      const t = await aiResp.text();
      console.error("AI error", aiResp.status, t);
      return json({ error: "AI-feil" }, 500);
    }

    const aiData = await aiResp.json();
    const call = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) return json({ error: "AI returnerte ikke struktur" }, 500);
    const parsed = JSON.parse(call.function.arguments);

    // Upsert tweaks
    const { data: tweak, error } = await supabase.from("application_cv_tweaks")
      .upsert({
        user_id: user.id,
        application_id: applicationId,
        tailored_intro: parsed.tailored_intro,
        highlight_experiences: parsed.highlight_experiences ?? [],
        deemphasize: parsed.deemphasize ?? [],
        prioritize_skills: parsed.prioritize_skills ?? [],
        rephrase_suggestions: parsed.rephrase_suggestions ?? [],
        tailored_cv_markdown: parsed.tailored_cv_markdown,
        notes: parsed.notes ?? null,
      }, { onConflict: "application_id" })
      .select().maybeSingle();
    if (error) return json({ error: error.message }, 500);

    return json({ tweak });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
