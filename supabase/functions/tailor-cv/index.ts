// Generates AI-tailored CV tweaks for a specific application,
// based on the user's CV template + the job description.
//
// Output now includes a fully-structured `tailored_cv` snapshot
// (same shape as cv_templates) plus a recommended `section_order`,
// so the application detail page can render a real PDF/preview
// in the same style as the cover letter.
//
// SAFETY: AI output is validated and filtered before being merged.
// Empty / malformed entries (e.g. `[{}]`) are dropped, and the
// original template values are kept for any field the AI did not
// supply meaningfully. This prevents render crashes on the client
// when the model returns junk-shaped objects.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { recordAiValidation, runAi } from "../_shared/ai.ts";
import {
  buildPreservedCvSnapshot,
  cleanSectionOrder,
  str,
  strArr,
  validRephrases,
} from "../_shared/cv-preserve.ts";
import {
  CV_TAILOR_PROMPT_VERSION,
  getCvTailoringSystemPrompt,
  tailorCvTool,
} from "../_shared/prompts/cv.ts";
import { findUnsupportedCvFacts, normalizeAiMode } from "../_shared/no-quality-rules.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    const body = await req.json();
    const { applicationId } = body;
    const mode = normalizeAiMode(body.mode);
    if (!applicationId) return json({ error: "applicationId påkrevd" }, 400);

    const [{ data: app }, { data: profile }] = await Promise.all([
      supabase.from("applications").select("*, jobs(*)").eq("id", applicationId).maybeSingle(),
      supabase.from("profiles").select("master_profile, style_guide").eq("user_id", user.id).maybeSingle(),
    ]);
    if (!app) return json({ error: "Søknad ikke funnet" }, 404);

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

    const ctx = `CV-MAL (JSON):\n${JSON.stringify(cv, null, 2)}\n\nMASTER-PROFIL:\n${profile?.master_profile ?? ""}\n\nSTIL-GUIDE:\n${profile?.style_guide ?? ""}\n\nSTILLING:\nTittel: ${app.jobs.title}\nSelskap: ${app.jobs.company ?? ""}\nBeskrivelse:\n${app.jobs.description ?? ""}\nAI-oppsummering: ${app.jobs.ai_summary ?? ""}`;

    const aiResult = await runAi({
      feature: "tailor_cv",
      tier: "balanced",
      mode,
      promptVersion: CV_TAILOR_PROMPT_VERSION,
      userId: user.id,
      supabase,
      system: getCvTailoringSystemPrompt(),
      user: ctx,
      tools: [tailorCvTool],
      toolChoice: { name: "tailor_cv" },
      maxOutputTokens: 3500,
    });

    const parsed: any = aiResult.toolCalls[0]?.arguments;
    if (!parsed) return json({ error: "AI returnerte ikke struktur" }, 500);

    const aiIntro = str(parsed.tailored_cv?.intro) || str(parsed.tailored_intro);
    const tailoredCv: any = buildPreservedCvSnapshot(
      { ...(parsed.tailored_cv ?? {}), intro: aiIntro || parsed.tailored_cv?.intro },
      cv,
      cv,
    );
    const unsupportedFacts = findUnsupportedCvFacts(tailoredCv, cv);
    await recordAiValidation(
      supabase,
      aiResult.runId,
      unsupportedFacts.length ? "failed" : "passed",
      unsupportedFacts.join("\n") || undefined,
    );
    if (unsupportedFacts.length) return json({ error: "AI foreslo CV-fakta som ikke finnes i original-CV-en.", details: unsupportedFacts }, 500);

    const nextSectionOrder = cleanSectionOrder(parsed.section_order);

    const { data: tweak, error } = await supabase.from("application_cv_tweaks")
      .upsert({
        user_id: user.id,
        application_id: applicationId,
        tailored_intro: aiIntro || cv.intro || null,
        highlight_experiences: strArr(parsed.highlight_experiences),
        deemphasize: strArr(parsed.deemphasize),
        prioritize_skills: strArr(parsed.prioritize_skills),
        rephrase_suggestions: validRephrases(parsed.rephrase_suggestions),
        tailored_cv_markdown: str(parsed.tailored_cv_markdown) || null,
        tailored_cv: tailoredCv,
        section_order: nextSectionOrder.length ? nextSectionOrder : (cv.section_order ?? null),
        notes: str(parsed.notes) || null,
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
