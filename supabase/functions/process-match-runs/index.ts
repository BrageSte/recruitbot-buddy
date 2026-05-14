import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  corsHeaders,
  evaluateMatchVisibility,
  ExternalJobRow,
  json,
} from "../_shared/full-match.ts";
import {
  activeNotExpiredFilter,
  loadMatchContext,
  rankJobForContext,
  saveMatchToPipeline,
  scoreAndStoreExternalJob,
} from "../_shared/match-run.ts";

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function timingSafeEqual(a: string, b: string) {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  if (left.length !== right.length) return false;

  let diff = 0;
  for (let i = 0; i < left.length; i++) {
    diff |= left[i] ^ right[i];
  }
  return diff === 0;
}

function authorizeCronRequest(req: Request) {
  const expected = Deno.env.get("PROCESS_MATCH_RUNS_CRON_SECRET")?.trim();
  if (!expected) {
    return json({ error: "PROCESS_MATCH_RUNS_CRON_SECRET is not configured" }, 500);
  }

  const provided = req.headers.get("x-cron-secret")?.trim() ?? "";
  if (!provided || !timingSafeEqual(provided, expected)) {
    return json({ error: "Unauthorized" }, 401);
  }

  return null;
}

async function countActiveJobs(admin: any, provider?: string | null) {
  let query = admin
    .from("external_jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", "active");
  if (provider) query = query.eq("provider", provider);
  const { count } = await query;
  return count ?? 0;
}

async function countCandidates(admin: any, runId: string, status?: string) {
  let query = admin
    .from("user_match_run_candidates")
    .select("id", { count: "exact", head: true })
    .eq("run_id", runId);
  if (status) query = query.eq("status", status);
  const { count } = await query;
  return count ?? 0;
}

async function loadRuns(admin: any, maxRuns: number) {
  const { data, error } = await admin
    .from("user_match_runs")
    .select("*")
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: true })
    .limit(maxRuns);
  if (error) throw error;
  return data ?? [];
}

async function scanRun(admin: any, run: any, context: Awaited<ReturnType<typeof loadMatchContext>>, maxScanRows: number) {
  let query = admin
    .from("external_jobs")
    .select("*")
    .eq("status", "active")
    .order("id", { ascending: true })
    .limit(maxScanRows);

  if (run.provider) query = query.eq("provider", run.provider);
  if (run.cursor_external_job_id) query = query.gt("id", run.cursor_external_job_id);

  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as ExternalJobRow[];
  const last = rows[rows.length - 1];
  const candidates = rows
    .filter(activeNotExpiredFilter)
    .flatMap((job) => {
      const { rank, preVisibility } = rankJobForContext(job, context);
      if (preVisibility.excludeRuleName) return [];
      if (rank <= 0 && !preVisibility.includeRuleName) return [];
      return [{
        run_id: run.id,
        user_id: run.user_id,
        external_job_id: job.id,
        lexical_rank: rank,
        status: "pending",
      }];
    });

  if (candidates.length > 0) {
    const { error: upsertErr } = await admin
      .from("user_match_run_candidates")
      .upsert(candidates, { onConflict: "run_id,external_job_id" });
    if (upsertErr) throw upsertErr;
  }

  return {
    scanned: rows.length,
    cursor: last?.id ?? run.cursor_external_job_id ?? null,
    scanComplete: rows.length < maxScanRows,
  };
}

async function scorePending(admin: any, run: any, context: Awaited<ReturnType<typeof loadMatchContext>>, maxScore: number) {
  const { data, error } = await admin
    .from("user_match_run_candidates")
    .select("*, external_jobs(*)")
    .eq("run_id", run.id)
    .eq("status", "pending")
    .order("lexical_rank", { ascending: false })
    .limit(maxScore);
  if (error) throw error;

  let scored = 0;
  let visible = 0;
  let jobsCreated = 0;
  let jobsUpdated = 0;
  let skipped = 0;

  for (const candidate of data ?? []) {
    const job = candidate.external_jobs as ExternalJobRow | null;
    if (!job || job.status !== "active" || !activeNotExpiredFilter(job)) {
      await admin
        .from("user_match_run_candidates")
        .update({ status: "skipped", last_error: "Jobb er ikke aktiv eller frist er utløpt." })
        .eq("id", candidate.id);
      skipped++;
      continue;
    }

    try {
      const { data: existing } = await admin
        .from("user_job_matches")
        .select("*")
        .eq("user_id", run.user_id)
        .eq("external_job_id", job.id)
        .maybeSingle();

      let matchId = existing?.id ?? null;
      let matchVisibility = existing?.match_score != null
        ? evaluateMatchVisibility(job, existing.match_score, context.minVisibleScore, context.visibilityRules)
        : null;

      if (!existing?.computed_at || existing.profile_hash !== context.profileHash) {
        const stored = await scoreAndStoreExternalJob(
          admin,
          run.user_id,
          job,
          context,
          Number(candidate.lexical_rank ?? 0),
          existing,
        );
        matchId = stored.saved?.id ?? null;
        matchVisibility = stored.visibility;
      }

      scored++;
      if (matchVisibility?.visible) {
        visible++;
        if (matchId) {
          const materialized = await saveMatchToPipeline(admin, run.user_id, matchId, {
            notifyHighMatch: true,
            notificationSource: "process-match-runs",
          });
          if (materialized.created) jobsCreated++;
          else if (materialized.updated) jobsUpdated++;
        }
      }

      await admin
        .from("user_match_run_candidates")
        .update({ status: "scored", match_id: matchId, last_error: null })
        .eq("id", candidate.id);
    } catch (e) {
      await admin
        .from("user_match_run_candidates")
        .update({ status: "failed", last_error: (e as Error).message.slice(0, 500) })
        .eq("id", candidate.id);
      skipped++;
      console.error("process-match-runs candidate failed", candidate.id, (e as Error).message);
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return { scored, visible, jobsCreated, jobsUpdated, skipped };
}

async function processRun(admin: any, run: any, maxScanRows: number, maxScore: number) {
  const startedAt = new Date().toISOString();
  await admin
    .from("user_match_runs")
    .update({ status: "running", started_at: run.started_at ?? startedAt, last_error: null })
    .eq("id", run.id);

  const context = await loadMatchContext(admin, run.user_id, run.min_visible_score);
  if (context.profileHash !== run.profile_hash) {
    await admin
      .from("user_match_runs")
      .update({
        status: "cancelled",
        last_error: "Profilen er endret siden denne fullscannen startet.",
        completed_at: new Date().toISOString(),
      })
      .eq("id", run.id);
    return { id: run.id, status: "cancelled", reason: "profile_changed" };
  }

  const totalEstimate = (run.total_estimate ?? 0) > 0
    ? run.total_estimate
    : await countActiveJobs(admin, run.provider);
  const scan = await scanRun(admin, run, context, maxScanRows);
  const scoring = await scorePending(admin, run, context, maxScore);
  const pending = await countCandidates(admin, run.id, "pending");
  const candidateCount = await countCandidates(admin, run.id);
  const scannedCount = (run.scanned_count ?? 0) + scan.scanned;
  const completed = scan.scanComplete && pending === 0;

  const { error: updateErr } = await admin
    .from("user_match_runs")
    .update({
      status: completed ? "completed" : "running",
      total_estimate: totalEstimate,
      scanned_count: scannedCount,
      candidate_count: candidateCount,
      scored_count: (run.scored_count ?? 0) + scoring.scored,
      visible_count: (run.visible_count ?? 0) + scoring.visible,
      jobs_created_count: (run.jobs_created_count ?? 0) + scoring.jobsCreated,
      cursor_external_job_id: scan.cursor,
      completed_at: completed ? new Date().toISOString() : null,
      last_error: null,
    })
    .eq("id", run.id);
  if (updateErr) throw updateErr;

  return {
    id: run.id,
    status: completed ? "completed" : "running",
    scanned: scan.scanned,
    scannedCount,
    totalEstimate,
    candidates: candidateCount,
    pending,
    scored: scoring.scored,
    visible: scoring.visible,
    jobsCreated: scoring.jobsCreated,
    jobsUpdated: scoring.jobsUpdated,
    skipped: scoring.skipped,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const unauthorized = authorizeCronRequest(req);
  if (unauthorized) return unauthorized;

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  if (body.healthcheck === true) {
    return json({ ok: true, mode: "healthcheck" });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const maxScanRows = clampInt(body.maxScanRows, 500, 1, 2000);
  const maxScore = clampInt(body.maxScore, 25, 1, 50);
  const maxRuns = clampInt(body.maxRuns, 2, 1, 5);

  try {
    const runs = await loadRuns(admin, maxRuns);
    const results = [];
    for (const run of runs) {
      try {
        results.push(await processRun(admin, run, maxScanRows, maxScore));
      } catch (e) {
        const message = (e as Error).message;
        await admin
          .from("user_match_runs")
          .update({ status: "failed", last_error: message.slice(0, 500), completed_at: new Date().toISOString() })
          .eq("id", run.id);
        results.push({ id: run.id, status: "failed", error: message });
      }
    }

    return json({ ok: true, runs: runs.length, results });
  } catch (e) {
    console.error("process-match-runs error", e);
    return json({ error: (e as Error).message }, 500);
  }
});
