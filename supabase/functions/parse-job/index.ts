import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { recordAiValidation, runAi } from "../_shared/ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYS = `Du er en assistent som leser stillingsannonser og returnerer strukturert JSON via et tool-kall. Svar alltid på norsk. Skriv en kort, ærlig oppsummering (1-2 setninger). Identifiser risk_flags som kan være problematiske: vagt språk, urealistiske krav, dårlige arbeidsforhold, manglende info om lønn/sted, "rockstar"-språk, etc.`;

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

    const { url, text } = await req.json();
    if (!url && !text) return json({ error: "url eller text påkrevd" }, 400);

    // Fetch text from URL if provided
    let raw = text ?? "";
    const sourceUrl: string | null = url ?? null;
    const source: "manual" | "url" = text && !url ? "manual" : "url";

    if (url && !text) {
      try {
        const resp = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 Sokly" } });
        const html = await resp.text();
        // crude html → text
        raw = html
          .replace(/<script[\s\S]*?<\/script>/gi, " ")
          .replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 15000);
      } catch (e) {
        return json({ error: `Kunne ikke hente URL: ${(e as Error).message}` }, 400);
      }
    }

    // Load profile
    const { data: profile } = await supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle();

    const tool = {
      name: "extract_job",
      description: "Returnerer strukturert info om en jobbstilling.",
      strict: false,
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          company: { type: "string" },
          location: { type: "string" },
          deadline: { type: "string", description: "ISO-dato YYYY-MM-DD eller tom streng" },
          description: { type: "string", description: "Hele stillingsteksten i ren markdown" },
          ai_summary: { type: "string", description: "1-2 setninger på norsk" },
          score_professional: { type: "integer", minimum: 0, maximum: 100 },
          score_culture: { type: "integer", minimum: 0, maximum: 100 },
          score_practical: { type: "integer", minimum: 0, maximum: 100 },
          score_enthusiasm: { type: "integer", minimum: 0, maximum: 100 },
          risk_flags: { type: "array", items: { type: "string" } },
        },
        required: ["title", "description", "ai_summary", "score_professional", "score_culture", "score_practical", "score_enthusiasm", "risk_flags"],
        additionalProperties: false,
      },
    };

    const profileContext = profile ? `\n\nBRUKERPROFIL:\n${profile.master_profile ?? ""}\n\nSØKEKRITERIER (vekting i %):\n- Fag: ${profile.weight_professional}\n- Kultur: ${profile.weight_culture}\n- Praktisk: ${profile.weight_practical}\n- Entusiasme: ${profile.weight_enthusiasm}\n\nGRØNN: ${profile.rules_green}\nGUL: ${profile.rules_yellow}\nRØD: ${profile.rules_red}` : "";

    const aiResult = await runAi({
      feature: "parse_job",
      tier: "fast",
      mode: "private",
      promptVersion: "parse-job-v2",
      userId: user.id,
      supabase,
      system: SYS + profileContext,
      user: `Parse og score denne stillingen mot brukerprofilen.\n\nKILDE: ${sourceUrl ?? "manuell innliming"}\n\nINNHOLD:\n${raw.slice(0, 12000)}`,
      tools: [tool],
      toolChoice: { name: "extract_job" },
      maxOutputTokens: 1800,
    });

    const parsed = aiResult.toolCalls[0]?.arguments as any;
    if (!parsed) return json({ error: "AI returnerte ikke struktur" }, 500);
    const requiredFields = ["title", "description", "ai_summary"];
    const missing = requiredFields.filter((field) => !String(parsed[field] ?? "").trim());
    await recordAiValidation(supabase, aiResult.runId, missing.length ? "failed" : "passed", missing.join(", ") || undefined);
    if (missing.length) return json({ error: "AI returnerte mangelfull jobbstruktur", missing }, 500);

    // Compute weighted total
    const w = profile ?? { weight_professional: 40, weight_culture: 20, weight_practical: 20, weight_enthusiasm: 20 };
    const total = Math.round(
      (parsed.score_professional * w.weight_professional +
        parsed.score_culture * w.weight_culture +
        parsed.score_practical * w.weight_practical +
        parsed.score_enthusiasm * w.weight_enthusiasm) / 100
    );

    const insert = {
      user_id: user.id,
      title: parsed.title,
      company: parsed.company || null,
      location: parsed.location || null,
      source,
      source_url: sourceUrl,
      description: parsed.description,
      deadline: parsed.deadline && /^\d{4}-\d{2}-\d{2}$/.test(parsed.deadline) ? parsed.deadline : null,
      ai_summary: parsed.ai_summary,
      match_score: total,
      score_professional: parsed.score_professional,
      score_culture: parsed.score_culture,
      score_practical: parsed.score_practical,
      score_enthusiasm: parsed.score_enthusiasm,
      risk_flags: parsed.risk_flags ?? [],
      status: "discovered" as const,
    };

    const { data: job, error: insErr } = await supabase.from("jobs").insert(insert).select().maybeSingle();
    if (insErr) return json({ error: insErr.message }, 500);

    return json({ job });
  } catch (e) {
    console.error("parse-job error", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
