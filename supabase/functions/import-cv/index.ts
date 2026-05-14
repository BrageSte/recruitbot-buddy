// Imports a CV from raw text or a PDF and returns structured CV JSON
// matching the cv_templates schema.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { recordAiValidation, runAi } from "../_shared/ai.ts";
import {
  IMPORT_CV_PROMPT_VERSION,
  getImportCvSystemPrompt,
  importCvSchema,
} from "../_shared/prompts/cv.ts";
import { findUnsupportedCvFacts } from "../_shared/no-quality-rules.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const supabase = authHeader
      ? createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
          { global: { headers: { Authorization: authHeader } } },
        )
      : undefined;
    const { data: userData } = supabase ? await supabase.auth.getUser() : { data: { user: null } as any };
    const user = userData.user;

    const body = await req.json();
    const { text, pdf_base64, mime_type } = body as {
      text?: string;
      pdf_base64?: string;
      mime_type?: string;
    };

    if (!text && !pdf_base64) {
      return new Response(
        JSON.stringify({ error: "Send enten 'text' eller 'pdf_base64'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Build user message content
    const userContent: any[] = [];
    if (text) {
      userContent.push({
        type: "text",
        text: `Parse denne CV-teksten til JSON:\n\n${text}`,
      });
    } else if (pdf_base64) {
      userContent.push({
        type: "text",
        text: "Parse denne CV-filen til JSON.",
      });
      userContent.push({
        type: "file",
        file: {
          filename: "cv.pdf",
          file_data: `data:${mime_type ?? "application/pdf"};base64,${pdf_base64}`,
        },
      });
    }

    const aiResult = await runAi({
      feature: "import_cv",
      tier: "fast",
      mode: "private",
      promptVersion: IMPORT_CV_PROMPT_VERSION,
      userId: user?.id ?? null,
      supabase,
      system: getImportCvSystemPrompt(),
      user: userContent,
      responseSchema: { name: "imported_cv", schema: importCvSchema, strict: false },
      maxOutputTokens: 3000,
    });

    const parsed = (aiResult.toolCalls[0]?.arguments || aiResult.json) as any;
    if (!parsed) {
      return new Response(JSON.stringify({ error: "Tomt AI-svar" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Defensive defaults
    const cv = {
      full_name: parsed.full_name ?? null,
      headline: parsed.headline ?? null,
      email: parsed.email ?? null,
      phone: parsed.phone ?? null,
      location: parsed.location ?? null,
      linkedin_url: parsed.linkedin_url ?? null,
      website_url: parsed.website_url ?? null,
      intro: parsed.intro ?? "",
      experiences: Array.isArray(parsed.experiences) ? parsed.experiences : [],
      education: Array.isArray(parsed.education) ? parsed.education : [],
      skills: Array.isArray(parsed.skills) ? parsed.skills : [],
      languages: Array.isArray(parsed.languages) ? parsed.languages : [],
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
      certifications: Array.isArray(parsed.certifications) ? parsed.certifications : [],
    };
    const unsupportedFacts = findUnsupportedCvFacts(cv, cv);
    await recordAiValidation(
      supabase,
      aiResult.runId,
      unsupportedFacts.length ? "failed" : "passed",
      unsupportedFacts.join("\n") || undefined,
    );

    return new Response(JSON.stringify({ cv }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("import-cv error", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
