import { describe, expect, it } from "vitest";
import {
  DEMO_KEYWORDS_MAX_LEN,
  buildDemoKeywords,
  scoreDemoJobs,
  type DemoJob,
} from "@/lib/demoScoring";

const sampleJobs: DemoJob[] = [
  {
    id: "1",
    title: "Produktleder",
    company: "X",
    location: "Oslo hybrid",
    source: "Finn",
    deadline: "2026-06-01",
    summary: "Roadmap og kunder. Mye reising mellom kontorer.",
    keywords: ["produkt", "roadmap", "kunde", "saas"],
  },
  {
    id: "2",
    title: "Frontend",
    company: "Y",
    location: "Bergen",
    source: "Arbeidsplassen",
    deadline: "2026-06-10",
    summary: "React og typescript.",
    keywords: ["react", "typescript", "frontend"],
  },
];

describe("buildDemoKeywords", () => {
  it("prioritizes role tokens before CV tokens", () => {
    const cv = "lang historie med erfaring fra produkt og analyse hos enterprise";
    const result = buildDemoKeywords(cv, "frontend react");
    const words = result.split(" ");
    expect(words[0]).toBe("frontend");
    expect(words[1]).toBe("react");
  });

  it("stays within match-anonymous keyword limit", () => {
    const big = "produkt analyse strategi kunde leder ".repeat(80);
    const result = buildDemoKeywords(big, "produktleder");
    expect(result.length).toBeLessThanOrEqual(DEMO_KEYWORDS_MAX_LEN);
  });

  it("handles empty or short input without crashing", () => {
    expect(buildDemoKeywords("", "")).toBe("");
    expect(buildDemoKeywords("ab", "")).toBe("");
    expect(buildDemoKeywords("", "ux")).toBe("");
  });
});

describe("scoreDemoJobs fallback", () => {
  it("preserves source and applies dealbreaker effect", () => {
    const withDeal = scoreDemoJobs("produkt roadmap", { roles: "produktleder", dealbreakers: "reising" }, sampleJobs);
    const withoutDeal = scoreDemoJobs("produkt roadmap", { roles: "produktleder" }, sampleJobs);
    const dealJob = withDeal.find((j) => j.id === "1")!;
    const cleanJob = withoutDeal.find((j) => j.id === "1")!;
    expect(dealJob.source).toBe("Finn");
    expect(dealJob.score).toBeLessThan(cleanJob.score);
  });
});
