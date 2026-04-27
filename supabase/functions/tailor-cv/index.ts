// Generates AI-tailored CV tweaks for a specific application,
// based on the user's CV template + the job description.
//
// Output now includes a fully-structured `tailored_cv` snapshot
// (same shape as cv_templates) plus a recommended `section_order`,
// so the application detail page can render a real PDF/preview
// in the same style as the cover letter.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYS = `Du tilpasser en CV til en spesifikk stilling. ABSOLUTT REGEL: Aldri finn på erfaring, utdanning, sertifiseringer eller ferdigheter som ikke finnes i mal-en.

Du SKAL produsere et komplett, strukturert "tailored_cv"-objekt med samme felter som mal-en. Innenfor dette har du lov til å:
- Omformulere intro, beskrivelser og bullet points slik at de treffer stillingen bedre.
- Endre rekkefølgen på elementer i listene (f.eks. flytte mest relevante erfaring øverst).
- Utelate enkeltelementer som er åpenbart irrelevante (f.eks. uvedkommende ferdigheter), når det styrker søknaden.
- Justere "section_order" slik at de viktigste avsnittene kommer først for denne stillingen.

I tillegg skal du levere korte AI-anbefalinger (intro, fremhev, ton ned, omformuleringer) og en markdown-versjon for arkiv.

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

    const [{ data: app }, { data: profile }] = await Promise.all([
      supabase.from("applications").select("*, jobs(*)").eq("id", applicationId).maybeSingle(),
      supabase.from("profiles").select("master_profile, style_guide").eq("user_id", user.id).maybeSingle(),
    ]);
    if (!app) return json({ error: "Søknad ikke funnet" }, 404);

    // Use the CV variant tied to this application, or fall back to the user's default.
    let cv: any = null;
    if (app.cv_template_id) {
      const { data } = await supabase.from("cv_templates").select("*").eq("id", app.cv_template_id).maybeSingle();
      cv = data;
    }
    if (!cv) {
      const { data } = await supabase
        .from("cv_templates")
        .select("*")
        .eq("user_id", user.id)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      cv = data;
    }
    if (!cv) return json({ error: "Du må opprette en CV-mal først." }, 400);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY mangler" }, 500);

    const ctx = `CV-MAL (JSON):\n${JSON.stringify(cv, null, 2)}\n\nMASTER-PROFIL:\n${profile?.master_profile ?? ""}\n\nSTIL-GUIDE:\n${profile?.style_guide ?? ""}\n\nSTILLING:\nTittel: ${app.jobs.title}\nSelskap: ${app.jobs.company ?? ""}\nBeskrivelse:\n${app.jobs.description ?? ""}\nAI-oppsummering: ${app.jobs.ai_summary ?? ""}`;

    // Loose schema for the tailored CV — mirrors cv_templates fields.
    // We avoid being overly strict so the model can pass through whatever
    // structure each list item already has (titles, bullets, dates, etc.).
    const tailoredCvSchema = {
      type: "object",
      description: "Komplett tilpasset CV-snapshot med samme struktur som mal-en. Behold originaldata, men omformuler/sorter/filtrer.",
      properties: {
        intro: { type: "string" },
        headline: { type: "string" },
        experiences: { type: "array", items: { type: "object", additionalProperties: true } },
        education: { type: "array", items: { type: "object", additionalProperties: true } },
        skills: { type: "array", items: { type: "object", additionalProperties: true } },
        languages: { type: "array", items: { type: "object", additionalProperties: true } },
        projects: { type: "array", items: { type: "object", additionalProperties: true } },
        certifications: { type: "array", items: { type: "object", additionalProperties: true } },
      },
      required: ["intro", "experiences", "education", "skills"],
    };

    const tool = {
      type: "function",
      function: {
        name: "tailor_cv",
        parameters: {
          type: "object",
          properties: {
            tailored_cv: tailoredCvSchema,
            section_order: {
              type: "array",
              items: { type: "string", enum: ["experiences", "education", "skills", "languages", "projects", "certifications"] },
              description: "Anbefalt rekkefølge på avsnitt for denne stillingen.",
            },
            tailored_intro: { type: "string", description: "2-4 linjer norsk tekst (samme som tailored_cv.intro)" },
            highlight_experiences: { type: "array", items: { type: "string" }, description: "Titler fra mal-ens experiences som bør fremheves" },
            deemphasize: { type: "array", items: { type: "string" }, description: "Titler som bør tones ned" },
            prioritize_skills: { type: "array", items: { type: "string" } },
            rephrase_suggestions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  context: { type: "string" },
                  before: { type: "string" },
                  after: { type: "string" },
                },
                required: ["context", "before", "after"],
              },
            },
            tailored_cv_markdown: { type: "string", description: "Komplett CV i markdown med tilpasninger anvendt" },
            notes: { type: "string" },
          },
          required: ["tailored_cv", "section_order", "tailored_intro", "highlight_experiences", "deemphasize", "prioritize_skills", "rephrase_suggestions", "tailored_cv_markdown"],
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

    // Merge the AI's tailored_cv onto the original template so we keep
    // contact info / styling fields the AI doesn't need to think about.
    const baseSnapshot: any = {
      full_name: cv.full_name,
      headline: cv.headline,
      email: cv.email,
      phone: cv.phone,
      location: cv.location,
      linkedin_url: cv.linkedin_url,
      website_url: cv.website_url,
      photo_url: cv.photo_url,
      cv_style: cv.cv_style,
      intro: cv.intro,
      experiences: cv.experiences,
      education: cv.education,
      skills: cv.skills,
      languages: cv.languages,
      projects: cv.projects,
      certifications: cv.certifications,
    };
    const tailoredCv = { ...baseSnapshot, ...(parsed.tailored_cv ?? {}) };

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
        tailored_cv: tailoredCv,
        section_order: parsed.section_order ?? cv.section_order ?? null,
        notes: parsed.notes ?? null,
      } as any, { onConflict: "application_id" })
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
