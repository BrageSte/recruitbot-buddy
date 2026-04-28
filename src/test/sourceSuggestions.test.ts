import { describe, expect, it } from "vitest";
import {
  buildArbeidsplassenSearchUrl,
  buildFinnSearchUrl,
  buildProfileSearchQueries,
  buildSourceSearchText,
  shouldAutoGenerateSourceSuggestions,
} from "@/lib/sourceSuggestions";

describe("source suggestion helpers", () => {
  it("builds a Finn job search URL from query and location", () => {
    expect(buildFinnSearchUrl("produkt leder", "Oslo")).toBe(
      "https://www.finn.no/job/search?q=produkt+leder&location=Oslo",
    );
  });

  it("builds copy text and Arbeidsplassen URL from query and location", () => {
    expect(buildSourceSearchText("produkt leder", "Oslo")).toBe("produkt leder Oslo");
    expect(buildArbeidsplassenSearchUrl("produkt leder", "Oslo")).toBe(
      "https://arbeidsplassen.nav.no/stillinger?q=produkt+leder+Oslo&v=5",
    );
  });

  it("builds profile search queries from strong signals only", () => {
    const queries = buildProfileSearchQueries([
      { label: "produktleder", category: "role", weight: 90 },
      { label: "hyggelig miljø", category: "value", weight: 90 },
      { label: "kveldsvakter", category: "dealbreaker", weight: -90 },
      { label: "brukerinnsikt", category: "task", weight: 70 },
    ], "Oslo");

    expect(queries).toEqual([
      { query: "produktleder", location: "Oslo" },
      { query: "brukerinnsikt", location: "Oslo" },
    ]);
  });

  it("auto-generates only when enabled and empty unless forced", () => {
    expect(shouldAutoGenerateSourceSuggestions(true, 0)).toBe(true);
    expect(shouldAutoGenerateSourceSuggestions(true, 3)).toBe(false);
    expect(shouldAutoGenerateSourceSuggestions(true, 3, true)).toBe(true);
    expect(shouldAutoGenerateSourceSuggestions(false, 0)).toBe(false);
  });
});
