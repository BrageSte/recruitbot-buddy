// Generates a tailored cover letter using master profile + style + CV variant + job.
// Supports multiple CV variants per user: caller can pick a specific cvTemplateId,
// let the AI choose the best variant, or fall back to the user's default.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { recordAiValidation, runAi } from "../_shared/ai.ts";
import {
  APPLICATION_PROMPT_VERSION,
  PICK_CV_PROMPT_VERSION,
  getApplicationSystemPrompt,
  makePickCvTool,
  writeApplicationTool,
} from "../_shared/prompts/application.ts";
import {
  buildQualityRewriteInstruction,
  normalizeAiMode,
  validateNorwegianDraft,
} from "../_shared/no-quality-rules.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    const applicationId: string | undefined = body.applicationId;
    const cvTemplateId: string | undefined = body.cvTemplateId;
    const letAiPick: boolean = Boolean(body.letAiPick);
    const instruction: string = String(body.instruction ?? "").trim();
    const mode = normalizeAiMode(body.mode);
    if (!jobId && !applicationId) return json({ error: "jobId eller applicationId påkrevd" }, 400);

    const { data: existingApp } = applicationId
      ? await supabase.from("applications").select("*").eq("id", applicationId).eq("user_id", user.id).maybeSingle()
      : { data: null as any };
    const resolvedJobId = jobId ?? existingApp?.job_id;
    if (!resolvedJobId) return json({ error: "Fant ikke jobb for søknaden" }, 400);

    const [{ data: job }, { data: profile }, { data: allCvs }] = await Promise.all([
      supabase.from("jobs").select("*").eq("id", resolvedJobId).maybeSingle(),
      supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("cv_templates").select("*").eq("user_id", user.id),
    ]);
    if (!job) return json({ error: "Jobb ikke funnet" }, 404);

    const cvs = (allCvs ?? []) as any[];
    if (cvs.length === 0) return json({ error: "Du må opprette en CV først." }, 400);

    // Resolve which CV variant to use.
    let cv: any | null = null;

    const resolvedCvTemplateId = cvTemplateId ?? existingApp?.cv_template_id ?? undefined;

    if (resolvedCvTemplateId) {
      cv = cvs.find((c) => c.id === resolvedCvTemplateId) ?? null;
    }

    if (!cv && letAiPick && cvs.length > 1) {
      try {
        const variantSummary = cvs.map((c) =>
          `- id: ${c.id}, navn: "${c.variant_name ?? "Standard"}", beskrivelse: "${c.variant_description ?? ""}", stil: ${c.cv_style ?? "skandinavisk"}`
        ).join("\n");

        const pickResult = await runAi({
          feature: "pick_cv",
          tier: "fast",
          mode,
          promptVersion: PICK_CV_PROMPT_VERSION,
          userId: user.id,
          supabase,
          system: "Du velger den CV-varianten som passer best for stillingen. Svar med tool-call og bruk én av de oppgitte id-ene.",
          user: `VARIANTER:\n${variantSummary}\n\nSTILLING:\nTittel: ${job.title}\nSelskap: ${job.company ?? ""}\nLokasjon: ${job.location ?? ""}\n\nBeskrivelse:\n${(job.description ?? "").slice(0, 3000)}`,
          tools: [makePickCvTool(cvs.map((c) => c.id))],
          toolChoice: { name: "pick_cv" },
          maxOutputTokens: 300,
        });
        const parsedPick = pickResult.toolCalls[0]?.arguments;
        cv = cvs.find((x) => x.id === parsedPick?.cv_template_id) ?? null;
      } catch (e) {
        console.error("cv pick failed", e);
      }
    }

    if (!cv) {
      // Fallback: default variant, else first one.
      cv = cvs.find((c) => c.is_default) ?? cvs[0];
    }

    const userContext = `MASTER-PROFIL:\n${profile?.master_profile ?? "(tom)"}\n\nSTIL-GUIDE:\n${profile?.style_guide ?? "(tom)"}\n\nCV-VARIANT: "${cv.variant_name ?? "Standard"}"\nCV-MAL (faktisk erfaring):\n${JSON.stringify(cv, null, 2)}\n\nSTILLING:\nTittel: ${job.title}\nSelskap: ${job.company ?? ""}\nLokasjon: ${job.location ?? ""}\n\nBeskrivelse:\n${job.description ?? ""}\n\nOppsummering: ${job.ai_summary ?? ""}\n\nMatchforklaring:\n${JSON.stringify(job.match_reasoning ?? {}, null, 2)}\n\nDelscores:\n- Fag: ${job.score_professional}\n- Kultur: ${job.score_culture}\n- Praktisk: ${job.score_practical}\n- Motivasjon: ${job.score_enthusiasm}\n\n${existingApp ? `EKSISTERENDE SØKNAD SOM SKAL REGENERERES:\n${existingApp.generated_text ?? ""}\n\nBRUKERINSTRUKSJON:\n${instruction || "Lag et bedre, mer konkret og mer arbeidsgiverrettet utkast."}` : ""}`;

    const aiResult = await runAi({
      feature: "generate_application",
      tier: "balanced",
      mode,
      promptVersion: APPLICATION_PROMPT_VERSION,
      userId: user.id,
      supabase,
      system: getApplicationSystemPrompt(mode),
      user: userContext,
      tools: [writeApplicationTool],
      toolChoice: { name: "write_application" },
      maxOutputTokens: mode === "cv_first" ? 900 : 1800,
    });

    let parsed: any = aiResult.toolCalls[0]?.arguments;
    if (!parsed?.application_text) return json({ error: "AI returnerte ikke struktur" }, 500);

    let quality = validateNorwegianDraft(String(parsed.application_text), mode);
    if (!quality.ok) {
      const rewrite = await runAi({
        feature: "generate_application",
        tier: "balanced",
        mode,
        promptVersion: `${APPLICATION_PROMPT_VERSION}:rewrite`,
        userId: user.id,
        supabase,
        system: getApplicationSystemPrompt(mode),
        user: buildQualityRewriteInstruction(String(parsed.application_text), quality, mode),
        tools: [writeApplicationTool],
        toolChoice: { name: "write_application" },
        maxOutputTokens: mode === "cv_first" ? 900 : 1800,
      });
      parsed = rewrite.toolCalls[0]?.arguments ?? parsed;
      quality = validateNorwegianDraft(String(parsed.application_text ?? ""), mode);
    }
    await recordAiValidation(
      supabase,
      aiResult.runId,
      quality.ok ? (quality.warnings.length ? "warning" : "passed") : "failed",
      [...quality.errors, ...quality.warnings].join("\n") || undefined,
    );
    if (!quality.ok) return json({ error: "AI-output passerte ikke kvalitetsreglene." }, 500);

    // Use the chosen CV's style. The user can still override style in the editor.
    const chosenStyle: string = cv.cv_style ?? "skandinavisk";
    const safeStyle = STYLES.includes(chosenStyle) ? chosenStyle : "skandinavisk";

    if (existingApp) {
      const previousText = existingApp.generated_text ?? "";
      const { error: updateErr } = await supabase.from("applications").update({
        generated_text: parsed.application_text,
        cv_notes: parsed.cv_notes,
        cv_style: safeStyle as any,
        cv_template_id: cv.id,
      } as any).eq("id", existingApp.id).eq("user_id", user.id);
      if (updateErr) return json({ error: updateErr.message }, 500);

      await supabase.from("application_revisions").insert({
        user_id: user.id,
        application_id: existingApp.id,
        instruction: instruction || null,
        source: "regenerate",
        previous_text: previousText,
        next_text: parsed.application_text,
        metadata: { cv_style: safeStyle, cv_template_id: cv.id, mode },
      } as any);

      return json({ applicationId: existingApp.id, cv_style: safeStyle, cv_template_id: cv.id, mode, regenerated: true });
    }

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

    return json({ applicationId: app!.id, cv_style: safeStyle, cv_template_id: cv.id, mode });
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
