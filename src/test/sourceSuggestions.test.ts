import { describe, expect, it } from "vitest";
import { buildFinnSearchUrl, shouldAutoGenerateSourceSuggestions } from "@/lib/sourceSuggestions";

describe("source suggestion helpers", () => {
  it("builds a Finn job search URL from query and location", () => {
    expect(buildFinnSearchUrl("produkt leder", "Oslo")).toBe(
      "https://www.finn.no/job/search?q=produkt+leder&location=Oslo",
    );
  });

  it("auto-generates only when enabled and empty unless forced", () => {
    expect(shouldAutoGenerateSourceSuggestions(true, 0)).toBe(true);
    expect(shouldAutoGenerateSourceSuggestions(true, 3)).toBe(false);
    expect(shouldAutoGenerateSourceSuggestions(true, 3, true)).toBe(true);
    expect(shouldAutoGenerateSourceSuggestions(false, 0)).toBe(false);
  });
});
