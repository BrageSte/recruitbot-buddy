export type SourceSuggestionProvider = "finn" | "arbeidsplassen";

export const SOURCE_PROVIDER_LABEL: Record<SourceSuggestionProvider, string> = {
  finn: "Finn",
  arbeidsplassen: "Arbeidsplassen",
};

export const buildSourceSearchText = (query: string, location?: string | null) =>
  [query.trim(), location?.trim()].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

export const buildFinnSearchUrl = (query: string, location?: string | null) => {
  const params = new URLSearchParams();
  params.set("q", query.trim());
  if (location?.trim()) params.set("location", location.trim());
  return `https://www.finn.no/job/search?${params.toString()}`;
};

export const buildArbeidsplassenSearchUrl = (query: string, location?: string | null) => {
  const params = new URLSearchParams();
  params.set("q", buildSourceSearchText(query, location));
  params.set("v", "5");
  return `https://arbeidsplassen.nav.no/stillinger?${params.toString()}`;
};

export const buildSourceSearchUrl = (
  provider: SourceSuggestionProvider,
  query: string,
  location?: string | null,
) => provider === "arbeidsplassen"
  ? buildArbeidsplassenSearchUrl(query, location)
  : buildFinnSearchUrl(query, location);

export const isStrongSearchSignal = (signal: { category?: string; weight?: number }) =>
  (signal.weight ?? 0) >= 45 && ["role", "task", "skill", "industry"].includes(signal.category ?? "");

export const buildProfileSearchQueries = (
  signals: { label: string; category?: string; weight?: number }[],
  location?: string | null,
  limit = 6,
) => {
  const seen = new Set<string>();
  return signals
    .filter(isStrongSearchSignal)
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
    .flatMap((signal) => {
      const label = signal.label.trim().replace(/\s+/g, " ");
      return label ? [{ query: label, location: location?.trim() || null }] : [];
    })
    .filter((item) => {
      const key = `${item.query.toLowerCase()}|${item.location?.toLowerCase() ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
};

export const shouldAutoGenerateSourceSuggestions = (
  enabled: boolean,
  existingCount: number,
  force = false,
) => enabled && (force || existingCount === 0);
