// Generates a tailored cover letter using master profile + style + CV template + job.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYS = `Du er en søknadsskriver. Skriv på norsk, ærlig, konkret, uten floskler. Bruk brukerens master-profil, stil-guide og CV-mal. Tilpass mot stillingen. Svar i markdown. Inkluder en kort hilsen, 3-5 avsnitt med konkrete koblinger mellom kandidatens faktiske erfaring (fra CV-mal) og stillingens behov, og en avslutning. Ikke finn på erfaringer. Hvis noe er uklart, hold det generelt.`;

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

    const { jobId } = await req.json();
    if (!jobId) return json({ error: "jobId påkrevd" }, 400);

    const [{ data: job }, { data: profile }, { data: cv }] = await Promise.all([
      supabase.from("jobs").select("*").eq("id", jobId).maybeSingle(),
      supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("cv_templates").select("*").eq("user_id", user.id).eq("is_active", true).maybeSingle(),
    ]);
    if (!job) return json({ error: "Jobb ikke funnet" }, 404);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY mangler" }, 500);

    const userContext = `MASTER-PROFIL:\n${profile?.master_profile ?? "(tom)"}\n\nSTIL-GUIDE:\n${profile?.style_guide ?? "(tom)"}\n\nCV-MAL (faktisk erfaring):\n${cv ? JSON.stringify(cv, null, 2) : "(ingen mal — bruk kun master-profil)"}\n\nSTILLING:\nTittel: ${job.title}\nSelskap: ${job.company ?? ""}\nLokasjon: ${job.location ?? ""}\n\nBeskrivelse:\n${job.description ?? ""}\n\nAI-oppsummering: ${job.ai_summary ?? ""}\n\nDelscores:\n- Fag: ${job.score_professional}\n- Kultur: ${job.score_culture}\n- Praktisk: ${job.score_practical}\n- Entusiasme: ${job.score_enthusiasm}`;

    const tool = {
      type: "function",
      function: {
        name: "write_application",
        parameters: {
          type: "object",
          properties: {
            application_text: { type: "string", description: "Hele søknaden i markdown, klar til sending." },
            cv_notes: { type: "string", description: "Markdown-notater om hva som bør vektlegges/justeres i CV-en for denne søknaden." },
          },
          required: ["application_text", "cv_notes"],
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
          { role: "user", content: userContext },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "write_application" } },
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) return json({ error: "AI rate limit nådd. Prøv igjen om litt." }, 429);
      if (aiResp.status === 402) return json({ error: "AI-kreditter brukt opp." }, 402);
      const t = await aiResp.text();
      console.error("AI error", aiResp.status, t);
      return json({ error: "AI-feil" }, 500);
    }

    const aiData = await aiResp.json();
    const call = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) return json({ error: "AI returnerte ikke struktur" }, 500);
    const parsed = JSON.parse(call.function.arguments);

    // Pick a CV style for this job (uses the same Lovable AI gateway).
    let chosenStyle: string | null = cv?.cv_style ?? "skandinavisk";
    try {
      const STYLES = ["skandinavisk", "korporat", "akademisk", "startup", "bold"];
      const styleResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: `Velg én CV-stil for denne stillingen. Stiler: skandinavisk (offentlig/bærekraft/helse), korporat (finans/jus/konsulent), akademisk (forskning/utdanning), startup (scaleup/produkt/tech), bold (design/media/kreativt).` },
            { role: "user", content: `Tittel: ${job.title}\nSelskap: ${job.company ?? ""}\n\n${(job.description ?? "").slice(0, 3000)}` },
          ],
          tools: [{ type: "function", function: { name: "pick_style", parameters: { type: "object", properties: { style: { type: "string", enum: STYLES } }, required: ["style"] } } }],
          tool_choice: { type: "function", function: { name: "pick_style" } },
        }),
      });
      if (styleResp.ok) {
        const sd = await styleResp.json();
        const c = sd.choices?.[0]?.message?.tool_calls?.[0];
        if (c) {
          const parsedStyle = JSON.parse(c.function.arguments);
          if (STYLES.includes(parsedStyle.style)) chosenStyle = parsedStyle.style;
        }
      }
    } catch (e) { console.error("style pick failed", e); }

    const { data: app, error: insErr } = await supabase.from("applications").insert({
      user_id: user.id,
      job_id: job.id,
      generated_text: parsed.application_text,
      cv_notes: parsed.cv_notes,
      cv_style: chosenStyle as any,
      status: "draft" as const,
    }).select().maybeSingle();
    if (insErr) return json({ error: insErr.message }, 500);

    if (job.status === "discovered") {
      await supabase.from("jobs").update({ status: "considering" as any }).eq("id", job.id);
    }

    return json({ applicationId: app!.id, cv_style: chosenStyle });
  } catch (e) {
    console.error("generate-application error", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
