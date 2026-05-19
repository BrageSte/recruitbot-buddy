import { describe, expect, it } from "vitest";
import {
  isActiveNotExpiredExternalJob,
  isExpiredDeadline,
  shouldArchiveNewMatchForExternal,
  shouldArchivePipelineJob,
} from "@/lib/staleJobs";

describe("stale job cleanup rules", () => {
  const today = "2026-05-19";

  it("treats yesterday as expired, today as active, and null as active", () => {
    expect(isExpiredDeadline("2026-05-18", today)).toBe(true);
    expect(isExpiredDeadline("2026-05-19", today)).toBe(false);
    expect(isExpiredDeadline(null, today)).toBe(false);
  });

  it("only considers active external jobs with non-expired deadlines visible", () => {
    expect(isActiveNotExpiredExternalJob({ status: "active", deadline: "2026-05-19" }, today)).toBe(true);
    expect(isActiveNotExpiredExternalJob({ status: "active", deadline: "2026-05-18" }, today)).toBe(false);
    expect(isActiveNotExpiredExternalJob({ status: "inactive", deadline: "2026-06-01" }, today)).toBe(false);
  });

  it("archives only new matches when their external job is inactive or expired", () => {
    const inactiveExternal = { status: "inactive", deadline: "2026-06-01" };

    expect(shouldArchiveNewMatchForExternal({ status: "new", external_jobs: inactiveExternal }, today)).toBe(true);
    expect(shouldArchiveNewMatchForExternal({ status: "saved", external_jobs: inactiveExternal }, today)).toBe(false);
    expect(shouldArchiveNewMatchForExternal({ status: "dismissed", external_jobs: inactiveExternal }, today)).toBe(false);
    expect(shouldArchiveNewMatchForExternal({ status: "archived", external_jobs: inactiveExternal }, today)).toBe(false);
  });

  it("archives only soft pipeline statuses for expired or inactive jobs", () => {
    expect(shouldArchivePipelineJob({ status: "discovered", deadline: "2026-05-18" }, today)).toBe(true);
    expect(shouldArchivePipelineJob({ status: "considering", external_jobs: { status: "inactive", deadline: null } }, today)).toBe(true);
    expect(shouldArchivePipelineJob({ status: "applied", deadline: "2026-05-18" }, today)).toBe(false);
    expect(shouldArchivePipelineJob({ status: "interview", external_jobs: { status: "inactive", deadline: null } }, today)).toBe(false);
    expect(shouldArchivePipelineJob({ status: "offer", deadline: "2026-05-18" }, today)).toBe(false);
    expect(shouldArchivePipelineJob({ status: "rejected", deadline: "2026-05-18" }, today)).toBe(false);
    expect(shouldArchivePipelineJob({ status: "archived", deadline: "2026-05-18" }, today)).toBe(false);
  });
});
