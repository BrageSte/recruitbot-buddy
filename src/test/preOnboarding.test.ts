import { describe, expect, it, beforeEach } from "vitest";
import {
  PRE_ONBOARDING_DRAFT_KEY,
  answersFromPreOnboardingDraft,
  hasUsefulPreOnboardingDraft,
  loadPreOnboardingDraft,
  normalizePreOnboardingDraft,
  questionsFromPreOnboardingDraft,
  savePreOnboardingDraft,
} from "@/lib/preOnboarding";

describe("pre onboarding draft helpers", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("normalizes email and LinkedIn URLs before persistence", () => {
    const draft = normalizePreOnboardingDraft({
      targetRoles: " Produktleder ",
      linkedinUrl: "linkedin.com/in/brage",
      email: " BRAGE@example.com ",
    });

    expect(draft.targetRoles).toBe("Produktleder");
    expect(draft.linkedinUrl).toBe("https://linkedin.com/in/brage");
    expect(draft.email).toBe("brage@example.com");
  });

  it("maps a pre-auth draft to onboarding answers", () => {
    const answers = answersFromPreOnboardingDraft({
      targetRoles: "Produkt og kundeinnsikt",
      desiredTasks: "Analyse og prototyping",
      location: "Oslo hybrid",
      workStyle: "Lite mikrostyring",
      dealbreakers: "Mye reising",
      linkedinUrl: "https://linkedin.com/in/brage",
    });

    expect(answers).toMatchObject({
      target_roles: "Produkt og kundeinnsikt",
      best_work: "Analyse og prototyping",
      strongest_skills: "Analyse og prototyping",
      location: "Oslo hybrid",
      work_style: "Lite mikrostyring",
      dealbreakers: "Mye reising",
      linkedin_url: "https://linkedin.com/in/brage",
    });
  });

  it("keeps the first three generated questions required and compact", () => {
    const questions = questionsFromPreOnboardingDraft();

    expect(questions).toHaveLength(5);
    expect(questions.slice(0, 3).every((question) => question.required)).toBe(true);
    expect(questions.map((question) => question.id)).toEqual([
      "target_roles",
      "best_work",
      "location",
      "dealbreakers",
      "work_style",
    ]);
  });

  it("round-trips useful draft data through sessionStorage", () => {
    savePreOnboardingDraft({ targetRoles: "Frontend", email: "a@b.no" });

    expect(window.sessionStorage.getItem(PRE_ONBOARDING_DRAFT_KEY)).toContain("Frontend");
    expect(loadPreOnboardingDraft()).toMatchObject({ targetRoles: "Frontend", email: "a@b.no" });
    expect(hasUsefulPreOnboardingDraft(loadPreOnboardingDraft())).toBe(true);
  });
});
