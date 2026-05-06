import { describe, expect, it } from "vitest";
import {
  discoveryToastDescription,
  matchStatusForJobStatus,
  statusToFeedbackDecision,
} from "@/lib/jobDiscovery";

describe("job discovery helpers", () => {
  it("writes negative feedback only when a job moves to archived or rejected", () => {
    expect(statusToFeedbackDecision("archived", "discovered")).toBe("uninterested");
    expect(statusToFeedbackDecision("rejected", "considering")).toBe("uninterested");
    expect(statusToFeedbackDecision("archived", "archived")).toBeNull();
    expect(statusToFeedbackDecision("applied", "discovered")).toBeNull();
  });

  it("maps job statuses back to match statuses for feedback loops", () => {
    expect(matchStatusForJobStatus("archived")).toBe("archived");
    expect(matchStatusForJobStatus("rejected")).toBe("dismissed");
    expect(matchStatusForJobStatus("applied")).toBeNull();
  });

  it("summarizes materialized job discovery counts", () => {
    expect(discoveryToastDescription({
      jobsCreated: 2,
      jobsUpdated: 1,
      materializedExisting: 3,
      scored: 10,
      visible: 5,
    })).toContain("2 nye, 1 oppdatert, 3 gamle matcher flyttet inn. 5/10 synlige treff.");
  });
});
