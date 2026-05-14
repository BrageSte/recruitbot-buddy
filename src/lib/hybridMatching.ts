import { rankExternalJobCandidate, termsFromSignals, type InterestSignal, type MatchableExternalJob } from "@/lib/fullMatch";

export type HybridVisibilityRule = {
  name?: string;
  action: "include" | "exclude";
  title_terms?: string[] | null;
  company_terms?: string[] | null;
  location_terms?: string[] | null;
  description_terms?: string[] | null;
  source_terms?: string[] | null;
  is_active?: boolean | null;
};

export type FullScanCandidate = {
  externalJobId: string;
  lexicalRank: number;
};

const PROTECTED_JOB_STATUSES = new Set(["applied", "interview", "offer", "rejected", "archived"]);

const normalizeForHash = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(normalizeForHash);
  if (!value || typeof value !== "object") return value ?? null;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    const v = (value as Record<string, unknown>)[key];
    if (typeof v === "undefined") continue;
    out[key] = normalizeForHash(v);
  }
  return out;
};

export const stableStringify = (value: unknown) => JSON.stringify(normalizeForHash(value));

export const stableHash = (value: unknown) => {
  const text = typeof value === "string" ? value : stableStringify(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `mh_${(hash >>> 0).toString(16).padStart(8, "0")}`;
};

const stableSignals = (signals: InterestSignal[]) =>
  signals
    .map((signal) => ({
      label: signal.label.trim().toLowerCase(),
      category: signal.category ?? "other",
      weight: signal.weight ?? 0,
    }))
    .sort((a, b) => `${a.category}|${a.label}|${a.weight}`.localeCompare(`${b.category}|${b.label}|${b.weight}`));

const stableRules = (rules: HybridVisibilityRule[]) =>
  rules
    .filter((rule) => rule.is_active !== false)
    .map((rule) => ({
      name: rule.name ?? "",
      action: rule.action,
      title_terms: rule.title_terms ?? [],
      company_terms: rule.company_terms ?? [],
      location_terms: rule.location_terms ?? [],
      description_terms: rule.description_terms ?? [],
      source_terms: rule.source_terms ?? [],
    }))
    .sort((a, b) => `${a.action}|${a.name}`.localeCompare(`${b.action}|${b.name}`));

export const buildProfileHash = (
  profile: Record<string, unknown> | null,
  cv: Record<string, unknown> | null,
  signals: InterestSignal[],
  visibilityRules: HybridVisibilityRule[] = [],
) =>
  stableHash({
    profile: {
      master_profile: profile?.master_profile ?? "",
      rules_green: profile?.rules_green ?? "",
      rules_yellow: profile?.rules_yellow ?? "",
      rules_red: profile?.rules_red ?? "",
      match_min_visible_score: profile?.match_min_visible_score ?? 65,
      weight_professional: profile?.weight_professional ?? 40,
      weight_culture: profile?.weight_culture ?? 20,
      weight_practical: profile?.weight_practical ?? 20,
      weight_enthusiasm: profile?.weight_enthusiasm ?? 20,
    },
    cv: cv
      ? {
          headline: cv.headline ?? null,
          intro: cv.intro ?? null,
          location: cv.location ?? null,
          skills: cv.skills ?? [],
          experiences: cv.experiences ?? [],
          education: cv.education ?? [],
        }
      : null,
    signals: stableSignals(signals),
    visibilityRules: stableRules(visibilityRules),
  });

export const scanExternalJobsForCandidates = (
  jobs: Array<MatchableExternalJob & { id: string; status?: string; deadline?: string | null }>,
  signals: InterestSignal[],
  requiredTerms: string[] = [],
) => {
  const { positive, negative } = termsFromSignals(signals);
  const seen = new Set<string>();
  const candidates: FullScanCandidate[] = [];

  for (const job of jobs) {
    if (job.status && job.status !== "active") continue;
    if (job.deadline && new Date(job.deadline).getTime() < Date.now() - 86400000) continue;
    const rank = rankExternalJobCandidate(job, positive, negative, requiredTerms);
    if (rank <= 0) continue;
    if (seen.has(job.id)) continue;
    seen.add(job.id);
    candidates.push({ externalJobId: job.id, lexicalRank: rank });
  }

  return { scannedCount: jobs.length, candidates: candidates.sort((a, b) => b.lexicalRank - a.lexicalRank) };
};

export const shouldPreserveExistingJobStatus = (status?: string | null) =>
  PROTECTED_JOB_STATUSES.has(status ?? "");

export const shouldCreateHighMatchNotification = (
  score: number | null | undefined,
  threshold: number,
  hasExistingNotification: boolean,
) => typeof score === "number" && score >= threshold && !hasExistingNotification;
