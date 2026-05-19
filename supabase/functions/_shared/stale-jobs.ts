export type CleanupStaleJobsStats = {
  ok: true;
  dryRun: boolean;
  externalExpiredInactivated: number;
  externalStaleInactivated: number;
  matchesArchived: number;
  jobsArchived: number;
};

const BATCH_SIZE = 500;
const IN_FILTER_BATCH_SIZE = 75;
const FINN_STALE_DAYS = 45;
const SOFT_PIPELINE_STATUSES = ["discovered", "considering"];

type CleanupOptions = {
  dryRun?: boolean;
  now?: Date;
};

export function todayDateString(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function staleCutoffIso(now = new Date(), days = FINN_STALE_DAYS) {
  return new Date(now.getTime() - days * 86400000).toISOString();
}

export function isExpiredDeadline(deadline: string | null | undefined, today = todayDateString()) {
  return typeof deadline === "string" && /^\d{4}-\d{2}-\d{2}$/.test(deadline) && deadline < today;
}

function chunks<T>(items: T[], size = BATCH_SIZE) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function countRows(query: any) {
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

async function collectIds(queryFactory: () => any, idField = "id") {
  const ids = new Set<string>();
  let from = 0;

  while (true) {
    const { data, error } = await queryFactory().range(from, from + BATCH_SIZE - 1);
    if (error) throw error;
    const rows = data ?? [];
    for (const row of rows) {
      const id = row?.[idField];
      if (id) ids.add(String(id));
    }
    if (rows.length < BATCH_SIZE) break;
    from += BATCH_SIZE;
  }

  return ids;
}

async function updateExternalJobs(admin: any, today: string, staleCutoff: string, dryRun: boolean) {
  const externalExpiredInactivated = await countRows(
    admin
      .from("external_jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .not("deadline", "is", null)
      .lt("deadline", today),
  );

  const externalStaleInactivated = await countRows(
    admin
      .from("external_jobs")
      .select("id", { count: "exact", head: true })
      .eq("provider", "finn")
      .eq("status", "active")
      .is("deadline", null)
      .lt("last_seen_at", staleCutoff),
  );

  if (!dryRun && externalExpiredInactivated > 0) {
    const { error } = await admin
      .from("external_jobs")
      .update({ status: "inactive" })
      .eq("status", "active")
      .not("deadline", "is", null)
      .lt("deadline", today);
    if (error) throw error;
  }

  if (!dryRun && externalStaleInactivated > 0) {
    const { error } = await admin
      .from("external_jobs")
      .update({ status: "inactive" })
      .eq("provider", "finn")
      .eq("status", "active")
      .is("deadline", null)
      .lt("last_seen_at", staleCutoff);
    if (error) throw error;
  }

  return { externalExpiredInactivated, externalStaleInactivated };
}

async function collectInactiveOrExpiredExternalIds(admin: any, today: string, staleCutoff: string) {
  const ids = new Set<string>();
  const add = (next: Set<string>) => next.forEach((id) => ids.add(id));

  add(await collectIds(() =>
    admin
      .from("external_jobs")
      .select("id")
      .eq("status", "inactive")
      .order("id", { ascending: true })
  ));

  add(await collectIds(() =>
    admin
      .from("external_jobs")
      .select("id")
      .not("deadline", "is", null)
      .lt("deadline", today)
      .order("id", { ascending: true })
  ));

  add(await collectIds(() =>
    admin
      .from("external_jobs")
      .select("id")
      .eq("provider", "finn")
      .eq("status", "active")
      .is("deadline", null)
      .lt("last_seen_at", staleCutoff)
      .order("id", { ascending: true })
  ));

  return ids;
}

async function archiveNewMatches(admin: any, externalJobIds: Set<string>, dryRun: boolean) {
  const matchIds = new Set<string>();

  for (const externalChunk of chunks(Array.from(externalJobIds), IN_FILTER_BATCH_SIZE)) {
    const ids = await collectIds(() =>
      admin
        .from("user_job_matches")
        .select("id")
        .eq("status", "new")
        .in("external_job_id", externalChunk)
        .order("id", { ascending: true })
    );
    ids.forEach((id) => matchIds.add(id));
  }

  if (!dryRun) {
    for (const matchChunk of chunks(Array.from(matchIds))) {
      const { error } = await admin
        .from("user_job_matches")
        .update({ status: "archived" })
        .in("id", matchChunk);
      if (error) throw error;
    }
  }

  return matchIds.size;
}

async function collectJobsToArchive(admin: any, externalJobIds: Set<string>, today: string) {
  const jobIds = new Set<string>();
  const add = (next: Set<string>) => next.forEach((id) => jobIds.add(id));

  add(await collectIds(() =>
    admin
      .from("jobs")
      .select("id")
      .in("status", SOFT_PIPELINE_STATUSES)
      .not("deadline", "is", null)
      .lt("deadline", today)
      .order("id", { ascending: true })
  ));

  for (const externalChunk of chunks(Array.from(externalJobIds), IN_FILTER_BATCH_SIZE)) {
    add(await collectIds(() =>
      admin
        .from("jobs")
        .select("id")
        .in("status", SOFT_PIPELINE_STATUSES)
        .in("external_job_id", externalChunk)
        .order("id", { ascending: true })
    ));
  }

  return jobIds;
}

async function archivePipelineJobs(admin: any, externalJobIds: Set<string>, today: string, dryRun: boolean) {
  const jobIds = await collectJobsToArchive(admin, externalJobIds, today);

  if (!dryRun) {
    for (const jobChunk of chunks(Array.from(jobIds))) {
      const { error } = await admin
        .from("jobs")
        .update({ status: "archived" })
        .in("id", jobChunk);
      if (error) throw error;
    }
  }

  return jobIds.size;
}

export async function cleanupStaleJobs(admin: any, options: CleanupOptions = {}): Promise<CleanupStaleJobsStats> {
  const dryRun = Boolean(options.dryRun);
  const now = options.now ?? new Date();
  const today = todayDateString(now);
  const staleCutoff = staleCutoffIso(now);

  const external = await updateExternalJobs(admin, today, staleCutoff, dryRun);
  const inactiveOrExpiredExternalIds = await collectInactiveOrExpiredExternalIds(admin, today, staleCutoff);
  const matchesArchived = await archiveNewMatches(admin, inactiveOrExpiredExternalIds, dryRun);
  const jobsArchived = await archivePipelineJobs(admin, inactiveOrExpiredExternalIds, today, dryRun);

  return {
    ok: true,
    dryRun,
    ...external,
    matchesArchived,
    jobsArchived,
  };
}
