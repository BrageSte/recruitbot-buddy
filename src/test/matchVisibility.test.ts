import { describe, expect, it } from "vitest";
import {
  evaluateMatchVisibility,
  matchVisibilityRule,
  visibilityRuleRankBoost,
  type MatchVisibilityRule,
} from "@/lib/matchVisibility";

const includeKlatre: MatchVisibilityRule = {
  name: "Klatrejobber hos Ditt og Datt",
  action: "include",
  title_terms: ["klatre"],
  company_terms: ["Ditt og Datt"],
  is_active: true,
};

const excludeOil: MatchVisibilityRule = {
  name: "Skjul offshore",
  action: "exclude",
  description_terms: ["offshore"],
  is_active: true,
};

describe("match visibility rules", () => {
  it("hides jobs below the score threshold without an include rule", () => {
    const result = evaluateMatchVisibility(
      { title: "Administrativ koordinator", company: "Eksempel AS" },
      42,
      65,
      [],
    );

    expect(result.visible).toBe(false);
    expect(result.hiddenBelowThreshold).toBe(true);
  });

  it("lets include rules show jobs below the score threshold", () => {
    const result = evaluateMatchVisibility(
      { title: "Klatreinstruktor", company: "Ditt og Datt AS" },
      23,
      65,
      [includeKlatre],
    );

    expect(result.visible).toBe(true);
    expect(result.includeRuleName).toBe("Klatrejobber hos Ditt og Datt");
  });

  it("lets exclude rules win over score and include rules", () => {
    const result = evaluateMatchVisibility(
      { title: "Klatreinstruktor", company: "Ditt og Datt AS", description: "Arbeid offshore og reise." },
      91,
      65,
      [includeKlatre, excludeOil],
    );

    expect(result.visible).toBe(false);
    expect(result.includeRuleName).toBe("Klatrejobber hos Ditt og Datt");
    expect(result.excludeRuleName).toBe("Skjul offshore");
  });

  it("matches rule fields across title, company, location, description and source", () => {
    const rule: MatchVisibilityRule = {
      name: "Oslo Finn friluft",
      action: "include",
      title_terms: ["leder"],
      company_terms: ["fjell"],
      location_terms: ["oslo"],
      description_terms: ["friluft"],
      source_terms: ["finn"],
      is_active: true,
    };

    expect(
      matchVisibilityRule(
        {
          title: "Daglig leder",
          company: "Fjellfolk",
          location: "Oslo",
          description: "Arbeid med friluft og kurs.",
          source: "finn",
        },
        rule,
      ),
    ).toBe(true);
  });

  it("boosts candidate ranking for include rules and penalizes exclude rules", () => {
    expect(visibilityRuleRankBoost({ title: "Klatreinstruktor", company: "Ditt og Datt" }, [includeKlatre])).toBeGreaterThan(0);
    expect(visibilityRuleRankBoost({ description: "Mye offshore arbeid" }, [excludeOil])).toBeLessThan(0);
  });
});
