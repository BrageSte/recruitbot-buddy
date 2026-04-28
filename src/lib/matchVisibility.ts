export type MatchVisibilityRuleAction = "include" | "exclude";

export type MatchVisibilityRule = {
  id?: string;
  name: string;
  action: MatchVisibilityRuleAction;
  title_terms?: string[] | null;
  company_terms?: string[] | null;
  location_terms?: string[] | null;
  description_terms?: string[] | null;
  source_terms?: string[] | null;
  is_active?: boolean | null;
};

export type MatchVisibilityJob = {
  title?: string | null;
  company?: string | null;
  location?: string | null;
  description?: string | null;
  source?: string | null;
  provider?: string | null;
};

export type MatchVisibilityResult = {
  minVisibleScore: number;
  visible: boolean;
  includeRuleName: string | null;
  excludeRuleName: string | null;
  hiddenBelowThreshold: boolean;
};

const normalizeTerm = (term: unknown) => String(term ?? "").trim().toLowerCase();

const normalizeTerms = (terms: string[] | null | undefined) =>
  (terms ?? []).map(normalizeTerm).filter(Boolean);

const fieldMatches = (value: unknown, terms: string[] | null | undefined) => {
  const normalized = normalizeTerms(terms);
  if (normalized.length === 0) return true;
  const haystack = normalizeTerm(value);
  if (!haystack) return false;
  return normalized.some((term) => haystack.includes(term));
};

export const matchVisibilityRule = (job: MatchVisibilityJob, rule: MatchVisibilityRule) => {
  if (rule.is_active === false) return false;
  const source = [job.source, job.provider].filter(Boolean).join(" ");
  return (
    fieldMatches(job.title, rule.title_terms) &&
    fieldMatches(job.company, rule.company_terms) &&
    fieldMatches(job.location, rule.location_terms) &&
    fieldMatches(job.description, rule.description_terms) &&
    fieldMatches(source, rule.source_terms)
  );
};

export const findMatchingVisibilityRule = (
  job: MatchVisibilityJob,
  rules: MatchVisibilityRule[],
  action: MatchVisibilityRuleAction,
) => rules.find((rule) => rule.action === action && matchVisibilityRule(job, rule)) ?? null;

export const evaluateMatchVisibility = (
  job: MatchVisibilityJob,
  score: number | null | undefined,
  minVisibleScore: number,
  rules: MatchVisibilityRule[],
): MatchVisibilityResult => {
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
};

export const visibilityRuleRankBoost = (job: MatchVisibilityJob, rules: MatchVisibilityRule[]) => {
  if (findMatchingVisibilityRule(job, rules, "exclude")) return -1000;
  return findMatchingVisibilityRule(job, rules, "include") ? 100 : 0;
};

export const clampVisibleScore = (value: unknown, fallback = 65) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
};
