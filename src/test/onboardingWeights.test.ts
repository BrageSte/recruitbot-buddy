import { describe, expect, it } from "vitest";
import { DEFAULT_MATCH_WEIGHTS, normalizeWeights, weightsFromPriority } from "@/lib/onboardingWeights";

describe("onboarding match weights", () => {
  it("uses the existing 40/20/20/20 weighting for balanced priority", () => {
    expect(weightsFromPriority("balanced")).toEqual(DEFAULT_MATCH_WEIGHTS);
  });

  it("turns simple priority choices into a 100-sum weighting", () => {
    for (const priority of ["professional", "practical", "culture", "enthusiasm"] as const) {
      const weights = weightsFromPriority(priority);

      expect(Object.values(weights).reduce((sum, value) => sum + value, 0)).toBe(100);
      expect(weights[priority]).toBeGreaterThanOrEqual(35);
    }
  });

  it("normalizes arbitrary advanced weights to a 100-sum result", () => {
    expect(normalizeWeights({ professional: 2, culture: 1, practical: 1, enthusiasm: 0 })).toEqual({
      professional: 50,
      culture: 25,
      practical: 25,
      enthusiasm: 0,
    });
  });

  it("falls back to defaults when all provided weights are empty or invalid", () => {
    expect(normalizeWeights({ professional: -5, culture: Number.NaN })).toEqual(DEFAULT_MATCH_WEIGHTS);
  });
});
