import { describe, expect, it } from "vitest";
import {
  buildCalendarCoachSuggestions,
  buildDailyCoach,
  type CoachContext,
} from "@/lib/dailyCoach";

const now = new Date("2026-05-06T09:00:00");

const baseContext = (patch: Partial<CoachContext> = {}): CoachContext => ({
  jobs: [],
  applications: [],
  events: [],
  goals: [{ id: "goal-1", kind: "target_date", title: "Ny jobb", status: "active" }],
  profile: { display_name: "Kari", master_profile: "Produktleder med erfaring fra B2B." },
  hasCv: true,
  sourceHealth: { hasActiveSources: true, hasErrors: false, activeCount: 1 },
  now,
  ...patch,
});

describe("daily coach", () => {
  it("prioritizes an interview tomorrow over a high-match job", () => {
    const coach = buildDailyCoach(baseContext({
      events: [{
        id: "ev-1",
        kind: "interview",
        title: "Intervju med Acme",
        event_date: "2026-05-07",
        event_time: "10:00:00",
      }],
      jobs: [{
        id: "job-1",
        title: "Senior produktleder",
        company: "Northwind",
        status: "discovered",
        match_score: 94,
      }],
    }));

    expect(coach.primaryAction.kind).toBe("interview");
    expect(coach.primaryAction.href).toBe("/calendar");
  });

  it("prioritizes a deadline within three days over a high-match job", () => {
    const coach = buildDailyCoach(baseContext({
      jobs: [
        {
          id: "job-deadline",
          title: "Produktsjef",
          company: "Acme",
          status: "discovered",
          deadline: "2026-05-08",
          match_score: 72,
        },
        {
          id: "job-high",
          title: "Lead PM",
          company: "Northwind",
          status: "discovered",
          match_score: 93,
        },
      ],
    }));

    expect(coach.primaryAction.kind).toBe("deadline");
    expect(coach.primaryAction.metadata?.jobId).toBe("job-deadline");
  });

  it("suggests follow-up for a sent application older than ten days", () => {
    const context = baseContext({
      applications: [{
        id: "app-1",
        job_id: "job-1",
        status: "sent",
        sent_at: "2026-04-20T12:00:00",
        jobs: { title: "Produktleder", company: "Acme" },
      }],
    });
    const coach = buildDailyCoach(context);
    const calendarSuggestions = buildCalendarCoachSuggestions(context);

    expect(coach.primaryAction.kind).toBe("follow_up");
    expect(calendarSuggestions[0].eventPayload).toMatchObject({
      kind: "follow_up",
      application_id: "app-1",
    });
  });

  it("turns a high-match job without an application into an open-job action", () => {
    const coach = buildDailyCoach(baseContext({
      jobs: [{
        id: "job-1",
        title: "Produktleder",
        company: "Acme",
        status: "discovered",
        match_score: 88,
      }],
    }));

    expect(coach.primaryAction.kind).toBe("high_match");
    expect(coach.primaryAction.href).toBe("/jobs/job-1");
  });

  it("puts CV setup first when the user has no CV", () => {
    const coach = buildDailyCoach(baseContext({
      hasCv: false,
      jobs: [{
        id: "job-1",
        title: "Produktleder",
        status: "discovered",
        match_score: 88,
      }],
    }));

    expect(coach.primaryAction.kind).toBe("setup_cv");
    expect(coach.primaryAction.href).toBe("/cv");
  });

  it("suggests a weekly planning session when calendar is empty and a goal is active", () => {
    const suggestions = buildCalendarCoachSuggestions(baseContext());

    expect(suggestions).toContainEqual(expect.objectContaining({
      id: "suggest-weekly-session",
      kind: "custom",
      eventPayload: expect.objectContaining({
        title: "Ukentlig jobbsøk-økt",
        kind: "custom",
        event_date: "2026-05-06",
      }),
    }));
  });

  it("creates valid calendar payloads for top-match application suggestions", () => {
    const suggestions = buildCalendarCoachSuggestions(baseContext({
      jobs: [{
        id: "job-1",
        title: "Produktleder",
        company: "Acme",
        status: "discovered",
        match_score: 91,
        deadline: "2026-05-10",
      }],
    }));

    expect(suggestions).toContainEqual(expect.objectContaining({
      id: "suggest-apply-job-1",
      eventPayload: expect.objectContaining({
        kind: "note",
        job_id: "job-1",
        event_date: "2026-05-09",
      }),
    }));
  });
});
