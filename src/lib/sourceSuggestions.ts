export const buildFinnSearchUrl = (query: string, location?: string | null) => {
  const params = new URLSearchParams();
  params.set("q", query.trim());
  if (location?.trim()) params.set("location", location.trim());
  return `https://www.finn.no/job/search?${params.toString()}`;
};

export const shouldAutoGenerateSourceSuggestions = (
  enabled: boolean,
  existingCount: number,
  force = false,
) => enabled && (force || existingCount === 0);
