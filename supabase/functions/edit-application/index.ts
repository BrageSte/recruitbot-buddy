import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { recordAiValidation, runAi } from "../_shared/ai.ts";
import { APPLICATION_EDIT_PROMPT_VERSION, getApplicationEditSystemPrompt } from "../_shared/prompts/application.ts";
import {
  buildQualityRewriteInstruction,
  normalizeAiMode,
  validateNorwegianDraft,
} from "../_shared/no-quality-rules.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { currentText, instruction, selection, jobTitle, company, jobDescription, mode: rawMode } = await req.json();
    const mode = normalizeAiMode(rawMode);

    if (typeof currentText !== "string" || !currentText.trim()) {
      return new Response(JSON.stringify({ error: "currentText er påkrevd" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (typeof instruction !== "string" || !instruction.trim()) {
      return new Response(JSON.stringify({ error: "instruction er påkrevd" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    const userParts: string[] = [];
    if (jobTitle || company) {
      userParts.push(`Stilling: ${jobTitle ?? "(ukjent)"}${company ? ` hos ${company}` : ""}`);
    }
    if (jobDescription) {
      userParts.push(`\nJobbeskrivelse (kontekst, ikke for sitering):\n${String(jobDescription).slice(0, 2000)}`);
    }

    if (selection && typeof selection === "string" && selection.trim() && currentText.includes(selection)) {
      userParts.push(`\nGjeldende søknadstekst:\n${currentText}`);
      userParts.push(`\nKun denne delen skal endres (resten beholdes ordrett):\n<SELECTION>${selection}</SELECTION>`);
    } else {
      userParts.push(`\nGjeldende søknadstekst:\n${currentText}`);
    }
    userParts.push(`\nInstruksjon fra bruker:\n${instruction.trim()}`);
    userParts.push(`\nReturner hele den oppdaterte søknadsteksten — ingenting annet.`);

    const aiResult = await runAi({
      feature: "edit_application",
      tier: "balanced",
      mode,
      promptVersion: APPLICATION_EDIT_PROMPT_VERSION,
      userId: user?.id ?? null,
      supabase,
      system: getApplicationEditSystemPrompt(),
      user: userParts.join("\n"),
      maxOutputTokens: 1500,
    });

    let newText = aiResult.text ?? "";
    newText = stripMarkdownFences(newText);

    let quality = validateNorwegianDraft(newText, mode);
    if (!quality.ok) {
      const rewrite = await runAi({
        feature: "edit_application",
        tier: "balanced",
        mode,
        promptVersion: `${APPLICATION_EDIT_PROMPT_VERSION}:rewrite`,
        userId: user?.id ?? null,
        supabase,
        system: getApplicationEditSystemPrompt(),
        user: buildQualityRewriteInstruction(newText, quality, mode),
        maxOutputTokens: 1500,
      });
      newText = stripMarkdownFences(rewrite.text ?? "");
      quality = validateNorwegianDraft(newText, mode);
    }
    await recordAiValidation(
      supabase,
      aiResult.runId,
      quality.ok ? (quality.warnings.length ? "warning" : "passed") : "failed",
      [...quality.errors, ...quality.warnings].join("\n") || undefined,
    );

    if (!newText) {
      return new Response(JSON.stringify({ error: "Tomt svar fra AI" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!quality.ok) {
      return new Response(JSON.stringify({ error: "AI-output passerte ikke kvalitetsreglene." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ newText }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("edit-application error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Ukjent feil" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function stripMarkdownFences(value: string) {
  return value.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```\s*$/, "").trim();
}
