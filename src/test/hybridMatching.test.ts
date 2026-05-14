import { describe, expect, it } from "vitest";
import {
  buildProfileHash,
  scanExternalJobsForCandidates,
  shouldCreateHighMatchNotification,
  shouldPreserveExistingJobStatus,
} from "@/lib/hybridMatching";

const profile = {
  master_profile: "Vil jobbe med produktutvikling og brukerinnsikt.",
  rules_green: "Produkt, analyse, brukerinnsikt",
  rules_yellow: "Uklart ansvar",
  rules_red: "Mye reising",
  match_min_visible_score: 65,
  weight_professional: 40,
  weight_culture: 20,
  weight_practical: 20,
  weight_enthusiasm: 20,
};

const cv = {
  headline: "Produktleder",
  skills: ["analyse", "intervjuer"],
  experiences: [{ role: "Produktleder", company: "Eksempel" }],
};

describe("hybrid matching helpers", () => {
  it("keeps profile hash stable for equivalent profile inputs", () => {
    const a = buildProfileHash(profile, cv, [
      { label: "Produktleder", category: "role", weight: 90 },
      { label: "Brukerinnsikt", category: "task", weight: 80 },
    ]);
    const b = buildProfileHash({ ...profile }, { ...cv }, [
      { label: "Brukerinnsikt", category: "task", weight: 80 },
      { label: "Produktleder", category: "role", weight: 90 },
    ]);

    expect(a).toBe(b);
  });

  it("changes profile hash when match-relevant profile inputs change", () => {
    const a = buildProfileHash(profile, cv, [{ label: "Produktleder", category: "role", weight: 90 }]);
    const b = buildProfileHash(
      { ...profile, rules_red: "Mye reising og nattarbeid" },
      cv,
      [{ label: "Produktleder", category: "role", weight: 90 }],
    );

    expect(a).not.toBe(b);
  });

  it("scans the whole cache and deduplicates candidates", () => {
    const jobs = Array.from({ length: 10_000 }, (_, index) => ({
      id: `job-${index}`,
      provider: "arbeidsplassen",
      external_id: `nav-${index}`,
      title: index % 100 === 0 ? "Produktleder" : "Butikkmedarbeider",
      description: index % 100 === 0 ? "Produktutvikling og brukerinnsikt." : "Kasse og varepåfylling.",
      status: "active",
    }));
    jobs.push({ ...jobs[0] });

    const result = scanExternalJobsForCandidates(
      jobs,
      [{ label: "Produktleder", category: "role", weight: 90 }],
      ["produktleder"],
    );

    expect(result.scannedCount).toBe(10_001);
    expect(result.candidates).toHaveLength(100);
    expect(new Set(result.candidates.map((candidate) => candidate.externalJobId)).size).toBe(100);
  });

  it("lets NAV profile-search style jobs outrank older broad-cache matches", () => {
    const result = scanExternalJobsForCandidates(
      [
        {
          id: "broad",
          provider: "arbeidsplassen",
          external_id: "nav-broad",
          title: "Rådgiver",
          description: "Produktleder nevnes bare indirekte.",
          status: "active",
        },
        {
          id: "profile",
          provider: "arbeidsplassen",
          external_id: "nav-profile",
          title: "Produktleder",
          description: "Produktutvikling.",
          status: "active",
          raw_data: { discovery: { source: "profile_search" } },
        },
      ],
      [{ label: "Produktleder", category: "role", weight: 90 }],
      ["produktleder"],
    );

    expect(result.candidates[0].externalJobId).toBe("profile");
  });

  it("preserves protected pipeline statuses during materialization", () => {
    expect(shouldPreserveExistingJobStatus("applied")).toBe(true);
    expect(shouldPreserveExistingJobStatus("interview")).toBe(true);
    expect(shouldPreserveExistingJobStatus("offer")).toBe(true);
    expect(shouldPreserveExistingJobStatus("rejected")).toBe(true);
    expect(shouldPreserveExistingJobStatus("archived")).toBe(true);
    expect(shouldPreserveExistingJobStatus("discovered")).toBe(false);
  });

  it("dedupes high-match notifications per job", () => {
    expect(shouldCreateHighMatchNotification(91, 90, false)).toBe(true);
    expect(shouldCreateHighMatchNotification(91, 90, true)).toBe(false);
    expect(shouldCreateHighMatchNotification(89, 90, false)).toBe(false);
  });
});
