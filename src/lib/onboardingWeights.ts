export type MatchPriority = "balanced" | "professional" | "practical" | "culture" | "enthusiasm";

export type MatchWeights = {
  professional: number;
  culture: number;
  practical: number;
  enthusiasm: number;
};

export const DEFAULT_MATCH_WEIGHTS: MatchWeights = {
  professional: 40,
  culture: 20,
  practical: 20,
  enthusiasm: 20,
};

export const weightsFromPriority = (priority: MatchPriority): MatchWeights => {
  switch (priority) {
    case "professional":
      return { professional: 55, culture: 15, practical: 15, enthusiasm: 15 };
    case "practical":
      return { professional: 35, culture: 15, practical: 35, enthusiasm: 15 };
    case "culture":
      return { professional: 35, culture: 35, practical: 15, enthusiasm: 15 };
    case "enthusiasm":
      return { professional: 35, culture: 15, practical: 15, enthusiasm: 35 };
    case "balanced":
    default:
      return DEFAULT_MATCH_WEIGHTS;
  }
};

export const normalizeWeights = (weights: Partial<MatchWeights> | null | undefined): MatchWeights => {
  const values = {
    professional: Number(weights?.professional),
    culture: Number(weights?.culture),
    practical: Number(weights?.practical),
    enthusiasm: Number(weights?.enthusiasm),
  };
  const entries = Object.entries(values).map(([key, value]) => [
    key,
    Number.isFinite(value) && value >= 0 ? Math.round(value) : 0,
  ] as const);
  const sum = entries.reduce((total, [, value]) => total + value, 0);
  if (sum <= 0) return DEFAULT_MATCH_WEIGHTS;

  const normalized = Object.fromEntries(
    entries.map(([key, value]) => [key, Math.floor((value / sum) * 100)]),
  ) as MatchWeights;
  const remainder = 100 - Object.values(normalized).reduce((total, value) => total + value, 0);
  normalized.professional += remainder;
  return normalized;
};
