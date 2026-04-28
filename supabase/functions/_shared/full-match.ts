export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_MODEL = "google/gemini-3-flash-preview";

export type ExternalJobProvider = "arbeidsplassen" | "finn";

export type ExternalJobRow = {
  id: string;
  provider: ExternalJobProvider;
  external_id: string;
  source_url: string | null;
  title: string;
  company: string | null;
  location: string | null;
  description: string | null;
  deadline: string | null;
  status: "active" | "inactive" | "unknown";
  raw_data: Record<string, unknown>;
  provider_updated_at: string | null;
  fetched_at: string;
};

export type MatchResult = {
  match_score: number;
  score_professional: number;
  score_culture: number;
  score_practical: number;
  score_enthusiasm: number;
  ai_summary: string;
  risk_flags: string[];
  match_reasoning: {
    summary: string;
    strengths: string[];
    concerns: string[];
    evidence: string[];
    recommendation: string;
    used_signals: string[];
  };
};

export type MatchVisibilityRule = {
  id?: string;
  name: string;
  action: "include" | "exclude";
  title_terms?: string[] | null;
  company_terms?: string[] | null;
  location_terms?: string[] | null;
  description_terms?: string[] | null;
  source_terms?: string[] | null;
  is_active?: boolean | null;
};

export type MatchVisibilityResult = {
  minVisibleScore: number;
  visible: boolean;
  includeRuleName: string | null;
  excludeRuleName: string | null;
  hiddenBelowThreshold: boolean;
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function stripHtml(html: string | null | undefined): string {
  return (html ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export function normalizeDeadline(value: unknown): string | null {
  if (!value || typeof value !== "string") return null;
  const v = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const no = v.match(/^(\d{1,2})[.-](\d{1,2})[.-](\d{4})$/);
  if (no) {
    const [, d, m, y] = no;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const iso = v.match(/^(\d{4}-\d{2}-\d{2})T/);
  if (iso) return iso[1];
  return null;
}

export function clampScore(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function clampVisibleScore(value: unknown, fallback = 65): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function normalizeRuleTerm(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeRuleTerms(terms: string[] | null | undefined): string[] {
  return (terms ?? []).map(normalizeRuleTerm).filter(Boolean);
}

function ruleFieldMatches(value: unknown, terms: string[] | null | undefined): boolean {
  const normalized = normalizeRuleTerms(terms);
  if (normalized.length === 0) return true;
  const hay = normalizeRuleTerm(value);
  if (!hay) return false;
  return normalized.some((term) => hay.includes(term));
}

export function matchVisibilityRule(job: ExternalJobRow, rule: MatchVisibilityRule): boolean {
  if (rule.is_active === false) return false;
  const source = [job.provider].filter(Boolean).join(" ");
  return (
    ruleFieldMatches(job.title, rule.title_terms) &&
    ruleFieldMatches(job.company, rule.company_terms) &&
    ruleFieldMatches(job.location, rule.location_terms) &&
    ruleFieldMatches(job.description, rule.description_terms) &&
    ruleFieldMatches(source, rule.source_terms)
  );
}

export function findMatchingVisibilityRule(
  job: ExternalJobRow,
  rules: MatchVisibilityRule[],
  action: "include" | "exclude",
): MatchVisibilityRule | null {
  return rules.find((rule) => rule.action === action && matchVisibilityRule(job, rule)) ?? null;
}

export function evaluateMatchVisibility(
  job: ExternalJobRow,
  score: number | null | undefined,
  minVisibleScore: number,
  rules: MatchVisibilityRule[],
): MatchVisibilityResult {
  const exclude = findMatchingVisibilityRule(job, rules, "exclude");
  const include = findMatchingVisibilityRule(job, rules, "include");
  const scoreVisible = typeof score === "number" && score >= minVisibleScore;
  const visible = !exclude && (scoreVisible || Boolean(include));
  return {
    minVisibleScore,
    visible,
    includeRuleName: include?.name ?? null,
    excludeRuleName: exclude?.name ?? null,
    hiddenBelowThreshold: !visible && !exclude && !scoreVisible,
  };
}

export function visibilityRuleRankBoost(job: ExternalJobRow, rules: MatchVisibilityRule[]): number {
  if (findMatchingVisibilityRule(job, rules, "exclude")) return -1000;
  return findMatchingVisibilityRule(job, rules, "include") ? 100 : 0;
}

export function tokenize(text: string): string[] {
  const stop = new Set([
    "og", "i", "på", "til", "for", "med", "av", "en", "et", "den", "det", "de",
    "du", "vi", "som", "er", "å", "a", "the", "of", "in", "to", "and", "or",
    "jobb", "stilling", "søker", "arbeid", "hos", "kan", "vil", "deg", "oss",
  ]);
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !stop.has(t))
    .slice(0, 120);
}

export function rankCandidate(job: ExternalJobRow, terms: string[], negativeTerms: string[] = []): number {
  const hay = `${job.title} ${job.company ?? ""} ${job.location ?? ""} ${job.description ?? ""}`.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (!term) continue;
    if (hay.includes(term.toLowerCase())) score += term.length > 8 ? 4 : 2;
  }
  for (const term of negativeTerms) {
    if (!term) continue;
    if (hay.includes(term.toLowerCase())) score -= 8;
  }
  if (job.deadline) {
    const days = (new Date(job.deadline).getTime() - Date.now()) / 86400000;
    if (days >= 0 && days <= 30) score += 3;
    if (days < 0) score -= 20;
  }
  if (job.provider === "arbeidsplassen") score += 1;
  return score;
}

export function buildJobText(job: ExternalJobRow): string {
  return [
    `Tittel: ${job.title}`,
    `Selskap: ${job.company ?? ""}`,
    `Sted: ${job.location ?? ""}`,
    `Frist: ${job.deadline ?? ""}`,
    `Kilde: ${job.provider}`,
    "",
    job.description ?? "",
  ].join("\n").slice(0, 14000);
}

export function buildSignalText(signals: any[] = []) {
  if (!signals.length) return "(ingen strukturerte interessesignaler ennå)";
  return signals
    .map((s) => `- ${s.label} [${s.category}, vekt ${s.weight}, kilde ${s.source}]`)
    .join("\n");
}

export function buildFeedbackText(feedback: any[] = []) {
  if (!feedback.length) return "(ingen feedback ennå)";
  return feedback
    .map((f) => `- ${f.decision}: score ${f.original_score ?? "?"}${f.note ? `, notat: ${f.note}` : ""}`)
    .join("\n");
}

export function buildProfileTerms(profile: any, cv: any, signals: any[], feedback: any[]) {
  const positiveSignals = signals.filter((s) => (s.weight ?? 0) >= 0 && s.category !== "dealbreaker");
  const negativeSignals = signals.filter((s) => (s.weight ?? 0) < 0 || s.category === "dealbreaker");
  const positiveText = [
    profile?.master_profile ?? "",
    cv?.headline ?? "",
    cv?.intro ?? "",
    JSON.stringify(cv?.skills ?? []),
    JSON.stringify(cv?.experiences ?? []),
    positiveSignals.map((s) => s.label).join(" "),
    feedback.filter((f) => f.decision === "interested" || f.decision === "very_interested").map((f) => f.note ?? "").join(" "),
  ].join(" ");
  const negativeText = [
    profile?.rules_red ?? "",
    negativeSignals.map((s) => s.label).join(" "),
    feedback.filter((f) => f.decision === "uninterested").map((f) => f.note ?? "").join(" "),
  ].join(" ");
  return {
    positiveTerms: Array.from(new Set(tokenize(positiveText))).slice(0, 80),
    negativeTerms: Array.from(new Set(tokenize(negativeText))).slice(0, 40),
  };
}

function fallbackMatch(job: ExternalJobRow, profile: any, signals: any[], lexicalRank: number): MatchResult {
  const weighted = Math.max(20, Math.min(82, Math.round(50 + lexicalRank)));
  const usedSignals = signals.slice(0, 6).map((s) => s.label);
  return {
    match_score: weighted,
    score_professional: weighted,
    score_culture: Math.max(20, Math.min(100, weighted - 4)),
    score_practical: Math.max(20, Math.min(100, weighted - 2)),
    score_enthusiasm: Math.max(20, Math.min(100, weighted + 3)),
    ai_summary: `${job.title}${job.company ? ` hos ${job.company}` : ""} kan være relevant basert på profiltermer, men er ikke AI-vurdert.`,
    risk_flags: [],
    match_reasoning: {
      summary: "Heuristisk match fordi AI-kall ikke var tilgjengelig.",
      strengths: usedSignals.length ? [`Treffer signaler som ${usedSignals.slice(0, 3).join(", ")}.`] : ["Tydelig stillingstekst og aktiv annonse."],
      concerns: profile?.master_profile ? [] : ["Profilen er lite utfylt, så scoren er usikker."],
      evidence: usedSignals,
      recommendation: weighted >= 70 ? "Se nærmere på stillingen." : "Lav/moderat prioritet.",
      used_signals: usedSignals,
    },
  };
}

export async function scoreExternalJob(
  job: ExternalJobRow,
  profile: any,
  cv: any,
  signals: any[],
  feedback: any[],
  lexicalRank: number,
): Promise<MatchResult> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return fallbackMatch(job, profile, signals, lexicalRank);

  const tool = {
    type: "function",
    function: {
      name: "score_job_match",
      description: "Score en stillingsannonse mot en kandidatprofil og forklar matchen.",
      parameters: {
        type: "object",
        properties: {
          match_score: { type: "integer", minimum: 0, maximum: 100 },
          score_professional: { type: "integer", minimum: 0, maximum: 100 },
          score_culture: { type: "integer", minimum: 0, maximum: 100 },
          score_practical: { type: "integer", minimum: 0, maximum: 100 },
          score_enthusiasm: { type: "integer", minimum: 0, maximum: 100 },
          ai_summary: { type: "string" },
          risk_flags: { type: "array", items: { type: "string" } },
          match_reasoning: {
            type: "object",
            properties: {
              summary: { type: "string" },
              strengths: { type: "array", items: { type: "string" } },
              concerns: { type: "array", items: { type: "string" } },
              evidence: { type: "array", items: { type: "string" } },
              recommendation: { type: "string" },
              used_signals: { type: "array", items: { type: "string" } },
            },
            required: ["summary", "strengths", "concerns", "evidence", "recommendation", "used_signals"],
          },
        },
        required: [
          "match_score",
          "score_professional",
          "score_culture",
          "score_practical",
          "score_enthusiasm",
          "ai_summary",
          "risk_flags",
          "match_reasoning",
        ],
      },
    },
  };

  const prompt = `Vurder denne jobben mot kandidaten. Bruk bare dokumenterte signaler. Ikke finn på erfaring.

MASTERPROFIL:
${profile?.master_profile ?? "(tom)"}

SCORINGSREGLER:
Grønn: ${profile?.rules_green ?? ""}
Gul: ${profile?.rules_yellow ?? ""}
Rød: ${profile?.rules_red ?? ""}
Vekter: fag ${profile?.weight_professional ?? 40}, kultur ${profile?.weight_culture ?? 20}, praktisk ${profile?.weight_practical ?? 20}, entusiasme ${profile?.weight_enthusiasm ?? 20}

STRUKTURERTE INTERESSER:
${buildSignalText(signals)}

SWIPE/FEEDBACK:
${buildFeedbackText(feedback)}

CV:
${cv ? JSON.stringify(cv, null, 2).slice(0, 7000) : "(ingen CV)"}

JOBB:
${buildJobText(job)}

Returner ærlig score. Bruk concerns for usikkerhet, dealbreakers, manglende sted/lønn eller dårlig treff.`;

  try {
    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: LOVABLE_MODEL,
        messages: [
          {
            role: "system",
            content: "Du er en norsk AI-rekrutterer. Du matcher jobber mot faktisk profil/CV og forklarer tydelig hvorfor.",
          },
          { role: "user", content: prompt },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "score_job_match" } },
      }),
    });

    if (!aiResp.ok) return fallbackMatch(job, profile, signals, lexicalRank);
    const data = await aiResp.json();
    const call = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) return fallbackMatch(job, profile, signals, lexicalRank);
    const parsed = JSON.parse(call.function.arguments);
    return {
      match_score: clampScore(parsed.match_score),
      score_professional: clampScore(parsed.score_professional),
      score_culture: clampScore(parsed.score_culture),
      score_practical: clampScore(parsed.score_practical),
      score_enthusiasm: clampScore(parsed.score_enthusiasm),
      ai_summary: String(parsed.ai_summary ?? "").slice(0, 1000),
      risk_flags: Array.isArray(parsed.risk_flags) ? parsed.risk_flags.map(String).slice(0, 12) : [],
      match_reasoning: {
        summary: String(parsed.match_reasoning?.summary ?? ""),
        strengths: Array.isArray(parsed.match_reasoning?.strengths) ? parsed.match_reasoning.strengths.map(String).slice(0, 8) : [],
        concerns: Array.isArray(parsed.match_reasoning?.concerns) ? parsed.match_reasoning.concerns.map(String).slice(0, 8) : [],
        evidence: Array.isArray(parsed.match_reasoning?.evidence) ? parsed.match_reasoning.evidence.map(String).slice(0, 8) : [],
        recommendation: String(parsed.match_reasoning?.recommendation ?? ""),
        used_signals: Array.isArray(parsed.match_reasoning?.used_signals) ? parsed.match_reasoning.used_signals.map(String).slice(0, 12) : [],
      },
    };
  } catch {
    return fallbackMatch(job, profile, signals, lexicalRank);
  }
}
