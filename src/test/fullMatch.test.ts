import { describe, expect, it } from "vitest";
import {
  dedupeExternalJobs,
  normalizeSignalLabel,
  rankExternalJobCandidate,
  termsFromSignals,
} from "@/lib/fullMatch";

describe("full match helpers", () => {
  it("normalizes interest signal labels", () => {
    expect(normalizeSignalLabel("  Produkt   utvikling ")).toBe("produkt utvikling");
  });

  it("deduplicates external jobs per provider and external id", () => {
    const jobs = dedupeExternalJobs([
      { provider: "arbeidsplassen", external_id: "1", title: "A" },
      { provider: "arbeidsplassen", external_id: "1", title: "A duplicate" },
      { provider: "finn", external_id: "1", title: "Finn A" },
    ]);

    expect(jobs).toHaveLength(2);
    expect(jobs.map((job) => `${job.provider}:${job.external_id}`)).toEqual([
      "arbeidsplassen:1",
      "finn:1",
    ]);
  });

  it("splits positive and negative profile signals", () => {
    const terms = termsFromSignals([
      { label: "produktutvikling", category: "task", weight: 80 },
      { label: "kveldsvakter", category: "dealbreaker", weight: 100 },
      { label: "mye reising", category: "work_style", weight: -50 },
    ]);

    expect(terms.positive).toContain("produktutvikling");
    expect(terms.negative).toEqual(expect.arrayContaining(["kveldsvakter", "mye", "reising"]));
  });

  it("ranks a job down when it hits dealbreaker terms", () => {
    const job = {
      provider: "arbeidsplassen",
      external_id: "abc",
      title: "Produktutvikler",
      description: "Produktutvikling med mye reising og kveldsvakter.",
    };

    const score = rankExternalJobCandidate(job, ["produktutvikling"], ["reising", "kveldsvakter"]);

    expect(score).toBeLessThan(0);
  });

  it("prioritizes a profile-search NAV job with relevant title metadata", () => {
    const relevant = {
      provider: "arbeidsplassen",
      external_id: "nav-1",
      title: "Produktleder for digitale tjenester",
      description: "Lede tverrfaglig produktutvikling.",
      raw_data: {
        discovery: { source: "profile_search" },
        properties: { searchtagsai: ["Produktleder", "Brukerinnsikt"] },
      },
    };
    const generic = {
      provider: "arbeidsplassen",
      external_id: "nav-2",
      title: "Administrativ medarbeider",
      description: "Koordinering, dokumentasjon og kundeservice.",
    };

    expect(rankExternalJobCandidate(relevant, ["produktleder", "brukerinnsikt"], [], ["produktleder"]))
      .toBeGreaterThan(rankExternalJobCandidate(generic, ["produktleder", "brukerinnsikt"], [], ["produktleder"]));
  });

  it("requires a strong NAV term when matching Arbeidsplassen candidates", () => {
    const job = {
      provider: "arbeidsplassen",
      external_id: "nav-3",
      title: "Koordinator",
      description: "Hyggelig arbeidsmiljø og fleksibel arbeidshverdag.",
    };

    expect(rankExternalJobCandidate(job, ["hyggelig", "fleksibel"], [], ["produktleder"])).toBe(-1000);
  });
});
