// Edits the per-application, AI-tailored CV snapshot from natural-language
// feedback. This does not mutate the user's original CV template.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { recordAiValidation, runAi } from "../_shared/ai.ts";
import {
  CV_EDIT_PROMPT_VERSION,
  editTailoredCvTool,
  getCvEditSystemPrompt,
} from "../_shared/prompts/cv.ts";
import { findUnsupportedCvFacts, normalizeAiMode } from "../_shared/no-quality-rules.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ALLOWED_SECTIONS = ["experiences", "education", "skills", "languages", "projects", "certifications"];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Mangler auth" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) return json({ error: "Ikke autentisert" }, 401);

    const body = await req.json().catch(() => ({}));
    const applicationId = String(body.applicationId ?? "").trim();
    const instruction = String(body.instruction ?? "").trim();
    const focusSection = String(body.focusSection ?? "auto").trim();
    const mode = normalizeAiMode(body.mode);

    if (!applicationId) return json({ error: "applicationId påkrevd" }, 400);
    if (!instruction) return json({ error: "instruction påkrevd" }, 400);

    const [{ data: app }, { data: profile }] = await Promise.all([
      supabase.from("applications").select("*, jobs(*)").eq("id", applicationId).eq("user_id", user.id).maybeSingle(),
      supabase.from("profiles").select("master_profile, style_guide").eq("user_id", user.id).maybeSingle(),
    ]);
    if (!app) return json({ error: "Søknad ikke funnet" }, 404);

    let cv: any = null;
    if (app.cv_template_id) {
      const { data } = await supabase
        .from("cv_templates")
        .select("*")
        .eq("id", app.cv_template_id)
        .eq("user_id", user.id)
        .maybeSingle();
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

    const { data: existingTweak } = await supabase
      .from("application_cv_tweaks")
      .select("*")
      .eq("application_id", applicationId)
      .maybeSingle();

    const originalCv = cvSnapshot(cv);
    const currentCv = cvSnapshot({ ...originalCv, ...(isObject(existingTweak?.tailored_cv) ? existingTweak.tailored_cv : {}) });
    const currentSectionOrder = cleanSectionOrder(
      existingTweak?.section_order ?? currentCv.section_order ?? originalCv.section_order,
    );
    currentCv.section_order = currentSectionOrder;

    const context = [
      `FOKUSOMRÅDE: ${focusSection || "auto"}`,
      `BRUKERFEEDBACK:\n${instruction}`,
      `\nSTILLING:\nTittel: ${app.jobs?.title ?? ""}\nSelskap: ${app.jobs?.company ?? ""}\nBeskrivelse:\n${String(app.jobs?.description ?? "").slice(0, 3500)}\nAI-oppsummering: ${app.jobs?.ai_summary ?? ""}`,
      `\nMASTER-PROFIL:\n${profile?.master_profile ?? ""}`,
      `\nSTIL-GUIDE:\n${profile?.style_guide ?? ""}`,
      `\nORIGINAL CV (faktagrunnlag, ikke endre kontaktfeltene):\n${JSON.stringify(originalCv, null, 2)}`,
      `\nCURRENT TAILORED CV (rediger denne snapshoten):\n${JSON.stringify(currentCv, null, 2)}`,
      `\nEKSISTERENDE ANBEFALINGER:\n${JSON.stringify({
        tailored_intro: existingTweak?.tailored_intro ?? null,
        highlight_experiences: existingTweak?.highlight_experiences ?? [],
        deemphasize: existingTweak?.deemphasize ?? [],
        prioritize_skills: existingTweak?.prioritize_skills ?? [],
        rephrase_suggestions: existingTweak?.rephrase_suggestions ?? [],
        notes: existingTweak?.notes ?? null,
      }, null, 2)}`,
    ].join("\n");

    const aiResult = await runAi({
      feature: "edit_tailored_cv",
      tier: "balanced",
      mode,
      promptVersion: CV_EDIT_PROMPT_VERSION,
      userId: user.id,
      supabase,
      system: getCvEditSystemPrompt(),
      user: context,
      tools: [editTailoredCvTool],
      toolChoice: { name: "edit_tailored_cv" },
      maxOutputTokens: 3500,
    });

    const parsed: any = aiResult.toolCalls[0]?.arguments;
    if (!parsed) return json({ error: "AI returnerte ikke struktur" }, 500);

    const nextCv = cleanAiCv(parsed.tailored_cv, currentCv, originalCv);
    const nextSectionOrder = cleanSectionOrder(parsed.section_order).length
      ? cleanSectionOrder(parsed.section_order)
      : currentSectionOrder;
    nextCv.section_order = nextSectionOrder;
    const unsupportedFacts = findUnsupportedCvFacts(nextCv, originalCv);
    await recordAiValidation(
      supabase,
      aiResult.runId,
      unsupportedFacts.length ? "failed" : "passed",
      unsupportedFacts.join("\n") || undefined,
    );
    if (unsupportedFacts.length) return json({ error: "AI foreslo CV-fakta som ikke finnes i original-CV-en.", details: unsupportedFacts }, 500);

    const nextIntro = str(parsed.tailored_intro) || str(nextCv.intro) || str(existingTweak?.tailored_intro) || null;
    const nextHighlights = hasOwn(parsed, "highlight_experiences")
      ? strArr(parsed.highlight_experiences)
      : strArr(existingTweak?.highlight_experiences);
    const nextDeemphasize = hasOwn(parsed, "deemphasize")
      ? strArr(parsed.deemphasize)
      : strArr(existingTweak?.deemphasize);
    const nextSkills = hasOwn(parsed, "prioritize_skills")
      ? strArr(parsed.prioritize_skills)
      : strArr(existingTweak?.prioritize_skills);
    const nextRephrases = hasOwn(parsed, "rephrase_suggestions")
      ? validRephrases(parsed.rephrase_suggestions)
      : arr(existingTweak?.rephrase_suggestions);
    const notes = str(parsed.notes) || str(existingTweak?.notes) || null;
    const markdown = str(parsed.tailored_cv_markdown) || str(existingTweak?.tailored_cv_markdown) || null;
    const changeSummary = str(parsed.change_summary) || "CV-tilpasningen er oppdatert.";

    const { data: savedTweak, error: saveError } = await supabase
      .from("application_cv_tweaks")
      .upsert({
        user_id: user.id,
        application_id: applicationId,
        tailored_intro: nextIntro,
        highlight_experiences: nextHighlights,
        deemphasize: nextDeemphasize,
        prioritize_skills: nextSkills,
        rephrase_suggestions: nextRephrases,
        tailored_cv_markdown: markdown,
        tailored_cv: nextCv,
        section_order: nextSectionOrder,
        notes,
      } as any, { onConflict: "application_id" })
      .select()
      .maybeSingle();
    if (saveError) return json({ error: saveError.message }, 500);

    const { error: revisionError } = await supabase.from("application_cv_revisions").insert({
      user_id: user.id,
      application_id: applicationId,
      tweak_id: savedTweak?.id ?? existingTweak?.id ?? null,
      instruction,
      previous_cv: currentCv,
      next_cv: nextCv,
      previous_section_order: currentSectionOrder,
      next_section_order: nextSectionOrder,
      metadata: { focusSection, change_summary: changeSummary },
    } as any);
    if (revisionError) console.error("application_cv_revisions insert failed", revisionError);

    return json({ tweak: savedTweak, changeSummary });
  } catch (e) {
    console.error("edit-tailored-cv error", e);
    return json({ error: e instanceof Error ? e.message : "Ukjent feil" }, 500);
  }
});

function toolDefinition() {
  const tailoredCvSchema = {
    type: "object",
    properties: {
      intro: { type: "string" },
      headline: { type: "string" },
      experiences: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            company: { type: "string" },
            location: { type: "string" },
            start: { type: "string" },
            end: { type: "string" },
            current: { type: "boolean" },
            description: { type: "string" },
            bullets: { type: "array", items: { type: "string" } },
            technologies: { type: "array", items: { type: "string" } },
          },
          required: ["title", "company"],
        },
      },
      education: {
        type: "array",
        items: {
          type: "object",
          properties: {
            degree: { type: "string" },
            institution: { type: "string" },
            start: { type: "string" },
            end: { type: "string" },
            description: { type: "string" },
          },
          required: ["degree", "institution"],
        },
      },
      skills: {
        type: "array",
        items: {
          type: "object",
          properties: {
            category: { type: "string" },
            items: { type: "array", items: { type: "string" } },
          },
          required: ["category", "items"],
        },
      },
      languages: {
        type: "array",
        items: {
          type: "object",
          properties: { name: { type: "string" }, level: { type: "string" } },
          required: ["name", "level"],
        },
      },
      projects: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            url: { type: "string" },
            technologies: { type: "array", items: { type: "string" } },
          },
          required: ["name", "description"],
        },
      },
      certifications: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            issuer: { type: "string" },
            date: { type: "string" },
            url: { type: "string" },
          },
          required: ["name", "issuer"],
        },
      },
    },
  };

  return {
    type: "function",
    function: {
      name: "edit_tailored_cv",
      parameters: {
        type: "object",
        properties: {
          tailored_cv: tailoredCvSchema,
          section_order: {
            type: "array",
            items: { type: "string", enum: ALLOWED_SECTIONS },
          },
          tailored_intro: { type: "string" },
          highlight_experiences: { type: "array", items: { type: "string" } },
          deemphasize: { type: "array", items: { type: "string" } },
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
          tailored_cv_markdown: { type: "string" },
          notes: { type: "string" },
          change_summary: { type: "string" },
        },
        required: ["tailored_cv", "section_order", "change_summary"],
      },
    },
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(value: unknown, key: string) {
  return isObject(value) && Object.prototype.hasOwnProperty.call(value, key);
}

function arr(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function strArr(value: unknown): string[] {
  return arr(value).map(str).filter(Boolean);
}

function cleanSectionOrder(value: unknown): string[] {
  return arr(value).filter((key) => typeof key === "string" && ALLOWED_SECTIONS.includes(key));
}

function cvSnapshot(cv: any) {
  return {
    full_name: cv?.full_name ?? null,
    headline: cv?.headline ?? null,
    email: cv?.email ?? null,
    phone: cv?.phone ?? null,
    location: cv?.location ?? null,
    linkedin_url: cv?.linkedin_url ?? null,
    website_url: cv?.website_url ?? null,
    photo_url: cv?.photo_url ?? null,
    cv_style: cv?.cv_style ?? "skandinavisk",
    intro: cv?.intro ?? null,
    section_order: cleanSectionOrder(cv?.section_order).length ? cleanSectionOrder(cv?.section_order) : ALLOWED_SECTIONS,
    experiences: arr(cv?.experiences),
    education: arr(cv?.education),
    skills: arr(cv?.skills),
    languages: arr(cv?.languages),
    projects: arr(cv?.projects),
    certifications: arr(cv?.certifications),
  };
}

function cleanAiCv(rawCv: unknown, fallback: any, original: any) {
  const raw = isObject(rawCv) ? rawCv : {};
  const next: any = {
    ...fallback,
    full_name: original.full_name,
    email: original.email,
    phone: original.phone,
    location: original.location,
    linkedin_url: original.linkedin_url,
    website_url: original.website_url,
    photo_url: original.photo_url,
    cv_style: original.cv_style,
  };

  const headline = str(raw.headline);
  if (headline) next.headline = headline;
  const intro = str(raw.intro);
  if (intro) next.intro = intro;

  applyArray(raw, next, "experiences", validExperiences);
  applyArray(raw, next, "education", validEducation);
  applyArray(raw, next, "skills", validSkillGroups);
  applyArray(raw, next, "languages", validLanguages);
  applyArray(raw, next, "projects", validProjects);
  applyArray(raw, next, "certifications", validCertifications);

  return next;
}

function applyArray(raw: Record<string, unknown>, target: any, key: string, validator: (value: unknown) => any[]) {
  if (!hasOwn(raw, key) || !Array.isArray(raw[key])) return;
  const rawArray = raw[key] as unknown[];
  const valid = validator(rawArray);
  if (rawArray.length === 0 || valid.length > 0) target[key] = valid;
}

function validExperiences(value: unknown) {
  return arr(value)
    .map((e) => ({
      title: str(e?.title),
      company: str(e?.company),
      location: str(e?.location) || undefined,
      start: str(e?.start),
      end: str(e?.end) || undefined,
      current: e?.current === true ? true : undefined,
      description: str(e?.description) || undefined,
      bullets: strArr(e?.bullets),
      technologies: strArr(e?.technologies),
    }))
    .filter((e) => e.title && e.company);
}

function validEducation(value: unknown) {
  return arr(value)
    .map((e) => ({
      degree: str(e?.degree),
      institution: str(e?.institution),
      start: str(e?.start),
      end: str(e?.end) || undefined,
      description: str(e?.description) || undefined,
    }))
    .filter((e) => e.degree && e.institution);
}

function validSkillGroups(value: unknown) {
  return arr(value)
    .map((group) => ({ category: str(group?.category), items: strArr(group?.items) }))
    .filter((group) => group.category && group.items.length);
}

function validLanguages(value: unknown) {
  return arr(value)
    .map((language) => ({ name: str(language?.name), level: str(language?.level) }))
    .filter((language) => language.name && language.level);
}

function validProjects(value: unknown) {
  return arr(value)
    .map((project) => ({
      name: str(project?.name),
      description: str(project?.description),
      url: str(project?.url) || undefined,
      technologies: strArr(project?.technologies),
    }))
    .filter((project) => project.name && project.description);
}

function validCertifications(value: unknown) {
  return arr(value)
    .map((cert) => ({
      name: str(cert?.name),
      issuer: str(cert?.issuer),
      date: str(cert?.date) || undefined,
      url: str(cert?.url) || undefined,
    }))
    .filter((cert) => cert.name && cert.issuer);
}

function validRephrases(value: unknown) {
  return arr(value)
    .map((item) => ({
      context: str(item?.context),
      before: str(item?.before),
      after: str(item?.after),
    }))
    .filter((item) => item.context && (item.before || item.after));
}
