export type ExternalJobFreshness = {
  status?: string | null;
  deadline?: string | null;
};

export type PipelineJobFreshness = {
  status?: string | null;
  deadline?: string | null;
  external_jobs?: ExternalJobFreshness | null;
};

export type MatchFreshness = {
  status?: string | null;
  external_jobs?: ExternalJobFreshness | null;
};

const SOFT_PIPELINE_STATUSES = new Set(["discovered", "considering"]);

export const todayDateString = (now = new Date()) => now.toISOString().slice(0, 10);

export const isExpiredDeadline = (deadline: string | null | undefined, today = todayDateString()) =>
  typeof deadline === "string" && /^\d{4}-\d{2}-\d{2}$/.test(deadline) && deadline < today;

export const isActiveNotExpiredExternalJob = (
  job: ExternalJobFreshness | null | undefined,
  today = todayDateString(),
) => Boolean(job && job.status === "active" && !isExpiredDeadline(job.deadline, today));

export const shouldArchivePipelineJob = (
  job: PipelineJobFreshness,
  today = todayDateString(),
) => {
  if (!SOFT_PIPELINE_STATUSES.has(job.status ?? "")) return false;
  if (isExpiredDeadline(job.deadline, today)) return true;
  if (!job.external_jobs) return false;
  return !isActiveNotExpiredExternalJob(job.external_jobs, today);
};

export const isVisiblePipelineJob = (
  job: PipelineJobFreshness,
  today = todayDateString(),
) => !shouldArchivePipelineJob(job, today);

export const shouldArchiveNewMatchForExternal = (
  match: MatchFreshness,
  today = todayDateString(),
) => match.status === "new" && !isActiveNotExpiredExternalJob(match.external_jobs, today);
