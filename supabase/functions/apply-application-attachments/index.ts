import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildAttachmentContext, readyAttachments } from "../_shared/attachment-context.ts";
import {
  ALLOWED_SECTIONS,
  arr,
  buildPreservedCvSnapshot,
  cleanSectionOrder,
  cvSnapshot,
  str,
  strArr,
  validRephrases,
} from "../_shared/cv-preserve.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LETTER_SYSTEM = `Du er en presis søknadsredaktør for norske jobbsøknader.

Brukeren har valgt ett eller flere vedlegg som skal flettes inn i søknaden. Bruk vedleggene som ekstra faktagrunnlag, men ikke finn på noe.

Regler:
- Returner KUN hele den oppdaterte søknadsteksten.
- Ikke skriv forklaring, overskrift eller markdown-kodeblokk.
- Behold språk, rolig tone og eksisterende struktur når det passer.
- Flett inn vedleggsfakta bare der de styrker relevans for stillingen.
- Ikke overdriv eller gjør vedleggsinformasjon til CV-fakta hvis teksten er uklar.
- Unngå floskler som "jeg brenner for", "lidenskapelig opptatt av" og tom entusiasme.`;

const CV_SYSTEM = `Du er en presis CV-redaktør for norske, jobbspesifikke CV-tilpasninger.

Brukeren har valgt ett eller flere vedlegg som ekstra faktagrunnlag for denne søknaden. Rediger bare den jobbspesifikke CV-snapshoten, aldri original CV-mal.

ABSOLUTTE REGLER:
- Ikke finn på erfaring, utdanning, sertifiseringer, teknologier, resultater, tall, arbeidsgivere eller egenskaper.
- Vedleggsfakta kan brukes bare når de står tydelig i vedleggsteksten.
- Behold kontakt-/identitetsfelt uendret.
- Standard er en relevant, jobbspesifikk CV-snapshot: sorter, fremhev og omformuler for stillingen.
- Ikke legg hele original-CV-en inn bakerst for sikkerhets skyld. Utelat mindre relevant innhold når det gir en tydeligere CV for denne søknaden.
- Returner alltid komplett strukturert JSON via tool-call. Bruk tomme arrays [], aldri [{}].
- Hold CV-en klassisk, konkret og PDF-sikker.`;

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
    const target = String(body.target ?? "").trim();
    const instruction = String(body.instruction ?? "").trim();
    const attachmentIds = Array.isArray(body.attachmentIds)
      ? body.attachmentIds.map((id: unknown) => String(id).trim()).filter(Boolean)
      : [];

    if (!applicationId) return json({ error: "applicationId påkrevd" }, 400);
    if (!["letter", "cv", "both"].includes(target)) return json({ error: "Ugyldig target" }, 400);
    if (attachmentIds.length === 0) return json({ error: "Velg minst ett vedlegg" }, 400);

    const [{ data: app }, { data: profile }, { data: attachments }] = await Promise.all([
      supabase.from("applications").select("*, jobs(*)").eq("id", applicationId).eq("user_id", user.id).maybeSingle(),
      supabase.from("profiles").select("master_profile, style_guide").eq("user_id", user.id).maybeSingle(),
      supabase
        .from("application_attachments")
        .select("id, file_name, extracted_text, ai_summary, extraction_status")
        .eq("application_id", applicationId)
        .eq("user_id", user.id)
        .in("id", attachmentIds),
    ]);

    if (!app) return json({ error: "Søknad ikke funnet" }, 404);

    const selectedReady = readyAttachments((attachments ?? []) as any[]);
    if (selectedReady.length === 0) return json({ error: "Ingen valgte vedlegg er AI-klare ennå" }, 400);

    const attachmentContext = buildAttachmentContext(selectedReady, {
      maxAttachments: 6,
      maxCharsPerAttachment: 4500,
      maxTotalChars: 18000,
    });
    if (!attachmentContext.trim()) return json({ error: "Vedleggene mangler lesbar tekst" }, 400);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY mangler" }, 500);

    let generatedText: string | null = null;
    let savedTweak: any = null;
    let changeSummary: string | null = null;

    if (target === "letter" || target === "both") {
      const beforeText = String(app.generated_text ?? "");
      generatedText = await applyToLetter({
        apiKey: LOVABLE_API_KEY,
        currentText: beforeText,
        app,
        profile,
        attachmentContext,
        instruction,
      });

      const { error: updateError } = await supabase
        .from("applications")
        .update({ generated_text: generatedText })
        .eq("id", applicationId)
        .eq("user_id", user.id);
      if (updateError) return json({ error: updateError.message }, 500);

      await supabase.from("application_revisions").insert({
        user_id: user.id,
        application_id: applicationId,
        instruction: instruction || "Flett inn valgte vedlegg",
        source: "edit",
        previous_text: beforeText,
        next_text: generatedText,
        metadata: { source: "attachments", attachment_ids: attachmentIds },
      } as any);
    }

    if (target === "cv" || target === "both") {
      const cvResult = await applyToCv({
        supabase,
        apiKey: LOVABLE_API_KEY,
        userId: user.id,
        app,
        profile,
        applicationId,
        attachmentIds,
        attachmentContext,
        instruction,
      });
      savedTweak = cvResult.tweak;
      changeSummary = cvResult.changeSummary;
    }

    return json({ generatedText, tweak: savedTweak, changeSummary });
  } catch (e) {
    console.error("apply-application-attachments error", e);
    return json({ error: e instanceof Error ? e.message : "Ukjent feil" }, 500);
  }
});

async function applyToLetter({
  apiKey,
  currentText,
  app,
  profile,
  attachmentContext,
  instruction,
}: {
  apiKey: string;
  currentText: string;
  app: any;
  profile: any;
  attachmentContext: string;
  instruction: string;
}) {
  if (!currentText.trim()) throw new Error("Søknadsteksten er tom");

  const userContent = [
    `STILLING:\nTittel: ${app.jobs?.title ?? ""}\nSelskap: ${app.jobs?.company ?? ""}\nBeskrivelse:\n${String(app.jobs?.description ?? "").slice(0, 3500)}\nAI-oppsummering: ${app.jobs?.ai_summary ?? ""}`,
    `MASTER-PROFIL:\n${profile?.master_profile ?? ""}`,
    `STIL-GUIDE:\n${profile?.style_guide ?? ""}`,
    `GJELDENDE SØKNADSTEKST:\n${currentText}`,
    `VALGTE VEDLEGG:\n${attachmentContext}`,
    `BRUKERINSTRUKSJON:\n${instruction || "Flett inn relevant informasjon fra vedleggene der det styrker søknaden."}`,
    "Returner hele den oppdaterte søknadsteksten, og ingenting annet.",
  ].join("\n\n");

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: LETTER_SYSTEM },
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!response.ok) throw new Error(await aiErrorMessage(response));
  const data = await response.json();
  const nextText = String(data?.choices?.[0]?.message?.content ?? "")
    .replace(/^```[a-zA-Z]*\n?/, "")
    .replace(/\n?```\s*$/, "")
    .trim();

  if (!nextText) throw new Error("Tomt svar fra AI");
  return nextText;
}

async function applyToCv({
  supabase,
  apiKey,
  userId,
  app,
  profile,
  applicationId,
  attachmentIds,
  attachmentContext,
  instruction,
}: {
  supabase: any;
  apiKey: string;
  userId: string;
  app: any;
  profile: any;
  applicationId: string;
  attachmentIds: string[];
  attachmentContext: string;
  instruction: string;
}) {
  const cv = await loadCv(supabase, userId, app);
  if (!cv) throw new Error("Du må opprette en CV-mal først.");

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
    `STILLING:\nTittel: ${app.jobs?.title ?? ""}\nSelskap: ${app.jobs?.company ?? ""}\nBeskrivelse:\n${String(app.jobs?.description ?? "").slice(0, 3500)}\nAI-oppsummering: ${app.jobs?.ai_summary ?? ""}`,
    `MASTER-PROFIL:\n${profile?.master_profile ?? ""}`,
    `STIL-GUIDE:\n${profile?.style_guide ?? ""}`,
    `ORIGINAL CV (faktagrunnlag):\n${JSON.stringify(originalCv, null, 2)}`,
    `CURRENT TAILORED CV (rediger denne snapshoten):\n${JSON.stringify(currentCv, null, 2)}`,
    `VALGTE VEDLEGG:\n${attachmentContext}`,
    `BRUKERINSTRUKSJON:\n${instruction || "Flett inn tydelig relevant informasjon fra vedleggene i CV-snapshoten uten å kutte eksisterende CV-innhold."}`,
  ].join("\n\n");

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: CV_SYSTEM },
        { role: "user", content: context },
      ],
      tools: [cvToolDefinition()],
      tool_choice: { type: "function", function: { name: "apply_attachment_cv_context" } },
    }),
  });

  if (!response.ok) throw new Error(await aiErrorMessage(response));
  const data = await response.json();
  const call = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) throw new Error("AI returnerte ikke struktur");

  let parsed: any;
  try {
    parsed = JSON.parse(call.function.arguments);
  } catch (_e) {
    throw new Error("AI returnerte ugyldig JSON");
  }

  const nextCv = buildPreservedCvSnapshot(parsed.tailored_cv, originalCv, currentCv);
  const nextSectionOrder = cleanSectionOrder(parsed.section_order).length
    ? cleanSectionOrder(parsed.section_order)
    : currentSectionOrder;
  nextCv.section_order = nextSectionOrder;

  const changeSummary = str(parsed.change_summary) || "CV-en er oppdatert med valgte vedlegg.";
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

  const { data: savedTweak, error: saveError } = await supabase
    .from("application_cv_tweaks")
    .upsert({
      user_id: userId,
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
  if (saveError) throw new Error(saveError.message);

  const { error: revisionError } = await supabase.from("application_cv_revisions").insert({
    user_id: userId,
    application_id: applicationId,
    tweak_id: savedTweak?.id ?? existingTweak?.id ?? null,
    instruction: instruction || "Flett inn valgte vedlegg",
    previous_cv: currentCv,
    next_cv: nextCv,
    previous_section_order: currentSectionOrder,
    next_section_order: nextSectionOrder,
    metadata: { source: "attachments", attachment_ids: attachmentIds, change_summary: changeSummary },
  } as any);
  if (revisionError) console.error("application_cv_revisions insert failed", revisionError);

  return { tweak: savedTweak, changeSummary };
}

async function loadCv(supabase: any, userId: string, app: any) {
  if (app.cv_template_id) {
    const { data } = await supabase
      .from("cv_templates")
      .select("*")
      .eq("id", app.cv_template_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (data) return data;
  }

  const { data } = await supabase
    .from("cv_templates")
    .select("*")
    .eq("user_id", userId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data;
}

function cvToolDefinition() {
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
      name: "apply_attachment_cv_context",
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

async function aiErrorMessage(response: Response) {
  if (response.status === 429) return "AI rate limit. Prøv igjen om litt.";
  if (response.status === 402) return "AI-kreditter brukt opp.";
  const text = await response.text();
  console.error("AI gateway error:", response.status, text);
  return "AI-feil";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(value: unknown, key: string) {
  return isObject(value) && Object.prototype.hasOwnProperty.call(value, key);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
