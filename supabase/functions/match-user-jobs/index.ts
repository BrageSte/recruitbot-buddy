import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  buildProfileTerms,
  corsHeaders,
  ExternalJobRow,
  json,
  rankCandidate,
  scoreExternalJob,
} from "../_shared/full-match.ts";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const CANDIDATE_POOL = 700;

function clampLimit(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.round(n)));
}

function statusForDecision(decision: string) {
  if (decision === "uninterested") return "dismissed";
  if (decision === "interested" || decision === "very_interested") return "saved";
  return "new";
}

async function getAuthedUser(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return { user: null, authHeader: null };
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data } = await userClient.auth.getUser();
  return { user: data.user, authHeader };
}

async function saveMatchToPipeline(admin: any, userId: string, matchId: string) {
  const { data: match, error: matchErr } = await admin
    .from("user_job_matches")
    .select("*, external_jobs(*)")
    .eq("id", matchId)
    .eq("user_id", userId)
    .maybeSingle();
  if (matchErr) throw matchErr;
  if (!match?.external_jobs) throw new Error("Match ikke funnet");

  const external = match.external_jobs;
  const { data: existing } = await admin
    .from("jobs")
    .select("id")
    .eq("user_id", userId)
    .eq("external_job_id", external.id)
    .maybeSingle();

  const payload = {
    user_id: userId,
    external_job_id: external.id,
    external_id: external.external_id,
    title: external.title,
    company: external.company,
    location: external.location,
    source: external.provider,
    source_url: external.source_url,
    description: external.description,
    deadline: external.deadline,
    ai_summary: match.match_reasoning?.summary ?? null,
    match_score: match.match_score,
    score_professional: match.score_professional,
    score_culture: match.score_culture,
    score_practical: match.score_practical,
    score_enthusiasm: match.score_enthusiasm,
    risk_flags: match.risk_flags ?? [],
    match_reasoning: match.match_reasoning ?? {},
    status: "discovered",
  };

  const { data: job, error: jobErr } = existing
    ? await admin.from("jobs").update(payload).eq("id", existing.id).select("id").maybeSingle()
    : await admin.from("jobs").insert(payload).select("id").maybeSingle();
  if (jobErr) throw jobErr;
  if (!job) throw new Error("Kunne ikke opprette pipeline-jobb");

  await admin
    .from("user_job_matches")
    .update({ status: "saved", job_id: job.id })
    .eq("id", matchId)
    .eq("user_id", userId);

  return job.id;
}

async function dismissMatch(admin: any, userId: string, matchId: string, note?: string | null) {
  const { data: match, error } = await admin
    .from("user_job_matches")
    .select("id, external_job_id, job_id, match_score")
    .eq("id", matchId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!match) throw new Error("Match ikke funnet");

  await admin
    .from("user_job_matches")
    .update({ status: "dismissed" })
    .eq("id", matchId)
    .eq("user_id", userId);

  await admin.from("job_score_feedback").insert({
    user_id: userId,
    job_id: match.job_id,
    external_job_id: match.external_job_id,
    user_job_match_id: match.id,
    decision: "uninterested",
    original_score: match.match_score,
    note: note ?? null,
    metadata: { source: "matches" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { user } = await getAuthedUser(req);
    if (!user) return json({ error: "Ikke autentisert" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    if (body.action === "save-match") {
      if (!body.matchId) return json({ error: "matchId påkrevd" }, 400);
      const jobId = await saveMatchToPipeline(admin, user.id, body.matchId);
      return json({ ok: true, jobId });
    }

    if (body.action === "dismiss-match") {
      if (!body.matchId) return json({ error: "matchId påkrevd" }, 400);
      await dismissMatch(admin, user.id, body.matchId, body.note);
      return json({ ok: true });
    }

    const limit = clampLimit(body.limit);
    const refresh = Boolean(body.refresh);
    const provider = body.provider === "arbeidsplassen" || body.provider === "finn" ? body.provider : null;

    const [{ data: profile }, { data: cv }, { data: signals }, { data: feedback }, { data: existingMatches }] =
      await Promise.all([
        admin.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
        admin.from("cv_templates").select("*").eq("user_id", user.id).order("is_default", { ascending: false }).order("created_at", { ascending: true }).limit(1).maybeSingle(),
        admin.from("profile_interest_signals").select("*").eq("user_id", user.id),
        admin
          .from("job_score_feedback")
          .select("decision, original_score, note, external_job_id")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(80),
        admin.from("user_job_matches").select("*").eq("user_id", user.id),
      ]);

    const { positiveTerms, negativeTerms } = buildProfileTerms(profile, cv, signals ?? [], feedback ?? []);
    let externalQ = admin
      .from("external_jobs")
      .select("*")
      .eq("status", "active")
      .order("provider_updated_at", { ascending: false, nullsFirst: false })
      .limit(CANDIDATE_POOL);
    if (provider) externalQ = externalQ.eq("provider", provider);

    const { data: externalJobs, error: jobsErr } = await externalQ;
    if (jobsErr) throw jobsErr;

    const existingByExternal = new Map<string, any>();
    for (const m of existingMatches ?? []) existingByExternal.set(m.external_job_id, m);

    const ranked = ((externalJobs ?? []) as ExternalJobRow[])
      .map((job) => ({
        job,
        rank: rankCandidate(job, positiveTerms, negativeTerms),
        existing: existingByExternal.get(job.id),
      }))
      .filter(({ existing }) => refresh || !existing || existing.status === "new")
      .filter(({ rank, existing }) => refresh || rank > -10 || !existing)
      .sort((a, b) => b.rank - a.rank)
      .slice(0, limit);

    let scored = 0;
    let skipped = 0;
    const results: any[] = [];

    for (const candidate of ranked) {
      const existing = candidate.existing;
      if (!refresh && existing?.computed_at) {
        skipped++;
        continue;
      }

      const match = await scoreExternalJob(
        candidate.job,
        profile,
        cv,
        signals ?? [],
        feedback ?? [],
        candidate.rank,
      );

      const status = existing?.status && existing.status !== "new" ? existing.status : statusForDecision("none");
      const { data: saved, error: saveErr } = await admin
        .from("user_job_matches")
        .upsert(
          {
            user_id: user.id,
            external_job_id: candidate.job.id,
            job_id: existing?.job_id ?? null,
            match_score: match.match_score,
            score_professional: match.score_professional,
            score_culture: match.score_culture,
            score_practical: match.score_practical,
            score_enthusiasm: match.score_enthusiasm,
            match_reasoning: {
              ...match.match_reasoning,
              ai_summary: match.ai_summary,
              lexical_rank: candidate.rank,
            },
            risk_flags: match.risk_flags,
            status,
            computed_at: new Date().toISOString(),
          },
          { onConflict: "user_id,external_job_id" },
        )
        .select("id, match_score")
        .maybeSingle();

      if (saveErr) {
        skipped++;
        console.error("match save failed", candidate.job.id, saveErr.message);
      } else {
        scored++;
        results.push({ id: saved?.id, externalJobId: candidate.job.id, score: match.match_score, title: candidate.job.title });
      }

      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    return json({
      ok: true,
      candidates: ranked.length,
      scored,
      skipped,
      results,
      profileSignals: signals?.length ?? 0,
      positiveTerms: positiveTerms.slice(0, 12),
    });
  } catch (e) {
    console.error("match-user-jobs error", e);
    return json({ error: (e as Error).message }, 500);
  }
});
