export type MatchableExternalJob = {
  provider: string;
  external_id: string;
  source_url?: string | null;
  title: string;
  company?: string | null;
  location?: string | null;
  description?: string | null;
  raw_data?: any;
};

export type InterestSignal = {
  label: string;
  category?: string;
  weight?: number;
};

const STOP_WORDS = new Set([
  "og",
  "eller",
  "for",
  "med",
  "til",
  "som",
  "det",
  "den",
  "jobb",
  "stilling",
  "arbeid",
  "the",
  "and",
  "for",
  "with",
]);

export const normalizeSignalLabel = (label: string) =>
  label.trim().toLowerCase().replace(/\s+/g, " ");

export const dedupeExternalJobs = <T extends MatchableExternalJob>(jobs: T[]) => {
  const seen = new Set<string>();
  return jobs.filter((job) => {
    const key = `${job.provider}:${job.external_id || job.source_url || job.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const tokenizeMatchText = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 3 && !STOP_WORDS.has(part));

export const termsFromSignals = (signals: InterestSignal[]) => {
  const positive = signals
    .filter((signal) => (signal.weight ?? 0) >= 0 && signal.category !== "dealbreaker")
    .flatMap((signal) => tokenizeMatchText(signal.label));
  const negative = signals
    .filter((signal) => (signal.weight ?? 0) < 0 || signal.category === "dealbreaker")
    .flatMap((signal) => tokenizeMatchText(signal.label));

  return {
    positive: Array.from(new Set(positive)),
    negative: Array.from(new Set(negative)),
  };
};

export const rankExternalJobCandidate = (
  job: MatchableExternalJob,
  positiveTerms: string[],
  negativeTerms: string[] = [],
  requiredTerms: string[] = [],
) => {
  const raw = job.raw_data ?? {};
  const properties = raw.properties ?? raw.ad_content?.properties ?? {};
  const tags = [
    ...(properties.searchtagsai ?? []),
    ...(properties.searchtags ?? []).map((tag: any) => tag?.label ?? tag?.name ?? ""),
    ...(raw.categoryList ?? raw.ad_content?.categoryList ?? []).map((cat: any) => cat?.name ?? ""),
    ...(raw.occupationList ?? raw.ad_content?.occupationList ?? []).map((occ: any) => `${occ?.level1 ?? ""} ${occ?.level2 ?? ""}`),
  ].join(" ");
  const titleHaystack = `${job.title} ${properties.jobtitle ?? ""} ${tags}`.toLowerCase();
  const bodyHaystack = `${job.company ?? ""} ${job.location ?? ""} ${job.description ?? ""}`.toLowerCase();
  const profileSearchBoost = raw.discovery?.source === "profile_search" ? 30 : 0;

  const requiredHit = requiredTerms.length === 0 || requiredTerms.some((term) => {
    const normalized = term.toLowerCase();
    return titleHaystack.includes(normalized) || bodyHaystack.includes(normalized);
  });
  if (job.provider === "arbeidsplassen" && requiredTerms.length > 0 && !requiredHit) return -1000;

  const positiveScore = positiveTerms.reduce((score, term) => {
    const normalized = term.toLowerCase();
    const titleHit = titleHaystack.includes(normalized);
    const bodyHit = bodyHaystack.includes(normalized);
    return score + (titleHit ? 8 : 0) + (bodyHit ? 1 : 0);
  }, 0);
  const negativeScore = negativeTerms.reduce((score, term) => {
    const normalized = term.toLowerCase();
    const titleHit = titleHaystack.includes(normalized);
    const bodyHit = bodyHaystack.includes(normalized);
    return score + (titleHit ? 18 : 0) + (bodyHit ? 12 : 0);
  }, 0);
  return positiveScore + profileSearchBoost - negativeScore;
};
