export type MatchableExternalJob = {
  provider: string;
  external_id: string;
  source_url?: string | null;
  title: string;
  company?: string | null;
  location?: string | null;
  description?: string | null;
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
) => {
  const haystack = `${job.title} ${job.company ?? ""} ${job.location ?? ""} ${job.description ?? ""}`.toLowerCase();
  const positiveScore = positiveTerms.reduce((score, term) => score + (haystack.includes(term.toLowerCase()) ? 2 : 0), 0);
  const negativeScore = negativeTerms.reduce((score, term) => score + (haystack.includes(term.toLowerCase()) ? 8 : 0), 0);
  return positiveScore - negativeScore;
};
