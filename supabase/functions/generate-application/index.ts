// Generates a tailored cover letter using master profile + style + CV variant + job.
// Supports multiple CV variants per user: caller can pick a specific cvTemplateId,
// let the AI choose the best variant, or fall back to the user's default.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYS = `Du er en søknadsskriver. Skriv på norsk, ærlig, konkret, uten floskler. Bruk brukerens master-profil, stil-guide og CV-mal. Tilpass mot stillingen. Svar i markdown. Inkluder en kort hilsen, 3-5 avsnitt med konkrete koblinger mellom kandidatens faktiske erfaring (fra CV-mal) og stillingens behov, og en avslutning. Ikke finn på erfaringer. Hvis noe er uklart, hold det generelt.`;

const STYLES = ["skandinavisk", "korporat", "akademisk", "startup", "bold"];

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

    const body = await req.json().catch(() => ({}));
    const jobId: string | undefined = body.jobId;
    const cvTemplateId: string | undefined = body.cvTemplateId;
    const letAiPick: boolean = Boolean(body.letAiPick);
    if (!jobId) return json({ error: "jobId påkrevd" }, 400);

    const [{ data: job }, { data: profile }, { data: allCvs }] = await Promise.all([
      supabase.from("jobs").select("*").eq("id", jobId).maybeSingle(),
      supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("cv_templates").select("*").eq("user_id", user.id),
    ]);
    if (!job) return json({ error: "Jobb ikke funnet" }, 404);

    const cvs = (allCvs ?? []) as any[];
    if (cvs.length === 0) return json({ error: "Du må opprette en CV først." }, 400);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY mangler" }, 500);

    // Resolve which CV variant to use.
    let cv: any | null = null;

    if (cvTemplateId) {
      cv = cvs.find((c) => c.id === cvTemplateId) ?? null;
    }

    if (!cv && letAiPick && cvs.length > 1) {
      try {
        const variantSummary = cvs.map((c) =>
          `- id: ${c.id}, navn: "${c.variant_name ?? "Standard"}", beskrivelse: "${c.variant_description ?? ""}", stil: ${c.cv_style ?? "skandinavisk"}`
        ).join("\n");

        const pickResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              { role: "system", content: "Du velger den CV-varianten som passer best for stillingen. Svar med tool-call og bruk én av de oppgitte id-ene." },
              { role: "user", content: `VARIANTER:\n${variantSummary}\n\nSTILLING:\nTittel: ${job.title}\nSelskap: ${job.company ?? ""}\nLokasjon: ${job.location ?? ""}\n\nBeskrivelse:\n${(job.description ?? "").slice(0, 3000)}` },
            ],
            tools: [{
              type: "function",
              function: {
                name: "pick_cv",
                parameters: {
                  type: "object",
                  properties: {
                    cv_template_id: { type: "string", enum: cvs.map((c) => c.id) },
                    reason: { type: "string" },
                  },
                  required: ["cv_template_id"],
                },
              },
            }],
            tool_choice: { type: "function", function: { name: "pick_cv" } },
          }),
        });
        if (pickResp.ok) {
          const pd = await pickResp.json();
          const c = pd.choices?.[0]?.message?.tool_calls?.[0];
          if (c) {
            const parsedPick = JSON.parse(c.function.arguments);
            cv = cvs.find((x) => x.id === parsedPick.cv_template_id) ?? null;
          }
        }
      } catch (e) {
        console.error("cv pick failed", e);
      }
    }

    if (!cv) {
      // Fallback: default variant, else first one.
      cv = cvs.find((c) => c.is_default) ?? cvs[0];
    }

    const userContext = `MASTER-PROFIL:\n${profile?.master_profile ?? "(tom)"}\n\nSTIL-GUIDE:\n${profile?.style_guide ?? "(tom)"}\n\nCV-VARIANT: "${cv.variant_name ?? "Standard"}"\nCV-MAL (faktisk erfaring):\n${JSON.stringify(cv, null, 2)}\n\nSTILLING:\nTittel: ${job.title}\nSelskap: ${job.company ?? ""}\nLokasjon: ${job.location ?? ""}\n\nBeskrivelse:\n${job.description ?? ""}\n\nAI-oppsummering: ${job.ai_summary ?? ""}\n\nMatchforklaring:\n${JSON.stringify(job.match_reasoning ?? {}, null, 2)}\n\nDelscores:\n- Fag: ${job.score_professional}\n- Kultur: ${job.score_culture}\n- Praktisk: ${job.score_practical}\n- Entusiasme: ${job.score_enthusiasm}`;

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

    // Use the chosen CV's style. The user can still override style in the editor.
    const chosenStyle: string = cv.cv_style ?? "skandinavisk";
    const safeStyle = STYLES.includes(chosenStyle) ? chosenStyle : "skandinavisk";

    const { data: app, error: insErr } = await supabase.from("applications").insert({
      user_id: user.id,
      job_id: job.id,
      generated_text: parsed.application_text,
      cv_notes: parsed.cv_notes,
      cv_style: safeStyle as any,
      cv_template_id: cv.id,
      status: "draft" as const,
    } as any).select().maybeSingle();
    if (insErr) return json({ error: insErr.message }, 500);

    if (job.status === "discovered") {
      await supabase.from("jobs").update({ status: "considering" as any }).eq("id", job.id);
    }

    return json({ applicationId: app!.id, cv_style: safeStyle, cv_template_id: cv.id });
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
