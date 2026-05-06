export const NEGATIVE_JOB_STATUSES = new Set(["archived", "rejected"]);

export const statusToFeedbackDecision = (status: string, previousStatus?: string | null) => {
  if (previousStatus === status) return null;
  return NEGATIVE_JOB_STATUSES.has(status) ? "uninterested" : null;
};

export const matchStatusForJobStatus = (status: string) => {
  if (status === "archived") return "archived";
  if (status === "rejected") return "dismissed";
  return null;
};

export const discoveryToastDescription = (result: {
  jobsCreated?: number;
  jobsUpdated?: number;
  materializedExisting?: number;
  scored?: number;
  visible?: number;
}) => {
  const created = result.jobsCreated ?? 0;
  const updated = result.jobsUpdated ?? 0;
  const materialized = result.materializedExisting ?? 0;
  const scored = result.scored ?? 0;
  const visible = result.visible ?? 0;
  return `${created} nye, ${updated} oppdatert, ${materialized} gamle matcher flyttet inn. ${visible}/${scored} synlige treff.`;
};
