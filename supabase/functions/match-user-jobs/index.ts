import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  buildProfileTerms,
  clampVisibleScore,
  corsHeaders,
  evaluateMatchVisibility,
  ExternalJobRow,
  json,
  profileSearchQueries,
  rankCandidate,
  scoreExternalJob,
  strongSearchTermsFromSignals,
  visibilityRuleRankBoost,
} from "../_shared/full-match.ts";
import { searchArbeidsplassenJobs } from "../_shared/nav-search.ts";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const CANDIDATE_POOL = 2000;
const PROFILE_SEARCH_HITS_PER_QUERY = 12;
const PRESERVED_MATCH_JOB_STATUSES = new Set(["applied", "interview", "offer", "rejected", "archived"]);

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

function matchStatusForJobStatus(status?: string | null) {
  if (status === "archived") return "archived";
  if (status === "rejected") return "dismissed";
  return "saved";
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
    .select("id,status")
    .eq("user_id", userId)
    .eq("external_job_id", external.id)
    .maybeSingle();

  const payload: Record<string, unknown> = {
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
    ai_summary: match.match_reasoning?.ai_summary ?? match.match_reasoning?.summary ?? null,
    match_score: match.match_score,
    score_professional: match.score_professional,
    score_culture: match.score_culture,
    score_practical: match.score_practical,
    score_enthusiasm: match.score_enthusiasm,
    risk_flags: match.risk_flags ?? [],
    match_reasoning: match.match_reasoning ?? {},
  };

  const { data: job, error: jobErr } = existing
    ? await admin.from("jobs").update(payload).eq("id", existing.id).select("id,status").maybeSingle()
    : await admin.from("jobs").insert({ ...payload, status: "discovered" }).select("id,status").maybeSingle();
  if (jobErr) throw jobErr;
  if (!job) throw new Error("Kunne ikke opprette pipeline-jobb");

  await admin
    .from("user_job_matches")
    .update({ status: matchStatusForJobStatus(existing?.status ?? job.status), job_id: job.id })
    .eq("id", matchId)
    .eq("user_id", userId);

  return {
    jobId: job.id,
    created: !existing,
    updated: Boolean(existing),
    preservedStatus: existing?.status ?? null,
    preservedProtectedStatus: PRESERVED_MATCH_JOB_STATUSES.has(existing?.status ?? ""),
  };
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

async function loadArbeidsplassenSuggestions(admin: any, userId: string, signals: any[], cv: any) {
  const { data } = await admin
    .from("source_suggestions")
    .select("id,name,query,location,confidence")
    .eq("user_id", userId)
    .eq("provider", "arbeidsplassen")
    .eq("is_active", true)
    .neq("status", "dismissed")
    .order("confidence", { ascending: false })
    .limit(8);

  if ((data ?? []).length > 0) return data ?? [];
  return profileSearchQueries(signals, cv, 6).map((item) => ({
    id: null,
    name: `NAV - ${item.query}${item.location ? ` ${item.location}` : ""}`,
    query: item.query,
    location: item.location,
    confidence: 70,
  }));
}

async function recordSourceHit(admin: any, row: Record<string, unknown>) {
  if (!row.source_suggestion_id && !row.rss_feed_id) return;

  let existingQuery = admin
    .from("source_suggestion_hits")
    .select("id")
    .eq("user_id", row.user_id)
    .eq("external_job_id", row.external_job_id);

  if (row.source_suggestion_id) existingQuery = existingQuery.eq("source_suggestion_id", row.source_suggestion_id);
  if (row.rss_feed_id) existingQuery = existingQuery.eq("rss_feed_id", row.rss_feed_id);

  const { data: existing } = await existingQuery.maybeSingle();
  if (existing?.id) {
    const { error } = await admin.from("source_suggestion_hits").update(row).eq("id", existing.id);
    if (error) console.error("source suggestion hit update failed", error.message);
    return;
  }

  const { error } = await admin.from("source_suggestion_hits").insert(row);
  if (error && error.code !== "23505") {
    console.error("source suggestion hit insert failed", error.message);
  }
}

async function upsertArbeidsplassenProfileHits(admin: any, userId: string, suggestions: any[]) {
  const ids = new Set<string>();
  let searches = 0;
  let found = 0;
  let errors = 0;
  const searchedAt = new Date().toISOString();

  for (const suggestion of suggestions) {
    try {
      const hits = await searchArbeidsplassenJobs(suggestion.query, suggestion.location ?? null, PROFILE_SEARCH_HITS_PER_QUERY);
      searches++;
      found += hits.length;
      for (const hit of hits) {
        const discovery = {
          source: "profile_search",
          provider: "arbeidsplassen",
          suggestionId: suggestion.id ?? null,
          suggestionName: suggestion.name ?? null,
          query: suggestion.query,
          location: suggestion.location ?? null,
          navScore: hit.nav_score,
          searchedAt,
        };
        const { data: existing } = await admin
          .from("external_jobs")
          .select("id,source_url,title,company,location,description,deadline,raw_data,provider_updated_at")
          .eq("provider", "arbeidsplassen")
          .eq("external_id", hit.external_id)
          .maybeSingle();
        const existingRaw = existing?.raw_data ?? {};
        const hasRichFeedData = Boolean(
          existing &&
            existing.description &&
            (existingRaw as any)?.discovery?.source !== "profile_search",
        );
        const payload = {
          provider: "arbeidsplassen",
          external_id: hit.external_id,
          source_url: hasRichFeedData ? existing.source_url ?? hit.source_url : hit.source_url,
          title: hasRichFeedData ? existing.title ?? hit.title : hit.title,
          company: hasRichFeedData ? existing.company ?? hit.company : hit.company,
          location: hasRichFeedData ? existing.location ?? hit.location : hit.location,
          description: hasRichFeedData ? existing.description ?? hit.description : hit.description,
          deadline: hasRichFeedData ? existing.deadline ?? hit.deadline : hit.deadline,
          status: "active",
          raw_data: { ...(hasRichFeedData ? existingRaw : hit.raw_data), discovery },
          provider_updated_at: existing?.provider_updated_at ?? (hit.raw_data as any).published ?? null,
          fetched_at: searchedAt,
          last_seen_at: searchedAt,
        };
        const { data: saved, error } = await admin
          .from("external_jobs")
          .upsert(payload, { onConflict: "provider,external_id" })
          .select("id")
          .maybeSingle();
        if (!error && saved?.id) {
          ids.add(saved.id);
          if (suggestion.id) {
            await recordSourceHit(admin, {
              user_id: userId,
              source_suggestion_id: suggestion.id,
              external_job_id: saved.id,
              provider: "arbeidsplassen",
              query: suggestion.query,
              location: suggestion.location ?? null,
              rank: ids.size,
              score: hit.nav_score ?? null,
              metadata: discovery,
              found_at: searchedAt,
            });
          }
        }
      }
    } catch (e) {
      errors++;
      console.error("Arbeidsplassen profile search failed", suggestion.query, (e as Error).message);
    }
  }

  return { ids, searches, found, errors };
}

async function archiveBroadArbeidsplassenMatches(admin: any, userId: string) {
  const { data } = await admin
    .from("user_job_matches")
    .select("id, status, external_jobs(provider, raw_data)")
    .eq("user_id", userId)
    .eq("status", "new");

  const ids = (data ?? [])
    .filter((match: any) => {
      const external = match.external_jobs;
      return external?.provider === "arbeidsplassen" && external?.raw_data?.discovery?.source !== "profile_search";
    })
    .map((match: any) => match.id);

  if (ids.length > 0) {
    await admin.from("user_job_matches").update({ status: "archived" }).in("id", ids).eq("user_id", userId);
  }
  return ids.length;
}

async function fetchExternalJobsByIds(admin: any, ids: Set<string>) {
  if (ids.size === 0) return [] as ExternalJobRow[];
  const out: ExternalJobRow[] = [];
  const all = Array.from(ids);
  for (let i = 0; i < all.length; i += 200) {
    const { data, error } = await admin
      .from("external_jobs")
      .select("*")
      .eq("status", "active")
      .in("id", all.slice(i, i + 200));
    if (error) throw error;
    out.push(...((data ?? []) as ExternalJobRow[]));
  }
  return out;
}

async function loadUserSourceHitIds(admin: any, userId: string, provider: string | null) {
  let query = admin
    .from("source_suggestion_hits")
    .select("external_job_id,provider")
    .eq("user_id", userId)
    .order("found_at", { ascending: false })
    .limit(CANDIDATE_POOL);
  if (provider) query = query.eq("provider", provider);
  const { data, error } = await query;
  if (error) throw error;
  return new Set((data ?? []).map((row: any) => row.external_job_id).filter(Boolean));
}

async function loadCandidateJobs(admin: any, userId: string, provider: string | null, profileSearchIds: Set<string>, includeBroadCache: boolean) {
  const jobs: ExternalJobRow[] = [];
  const targetedIds = await loadUserSourceHitIds(admin, userId, provider);

  if ((!provider || provider === "arbeidsplassen") && profileSearchIds.size > 0) {
    for (const id of profileSearchIds) targetedIds.add(id);
  }

  jobs.push(...await fetchExternalJobsByIds(admin, targetedIds));

  if (includeBroadCache && (!provider || provider === "finn")) {
    const { data, error } = await admin
      .from("external_jobs")
      .select("*")
      .eq("status", "active")
      .eq("provider", "finn")
      .order("provider_updated_at", { ascending: false, nullsFirst: false })
      .limit(Math.ceil(CANDIDATE_POOL / 2));
    if (error) throw error;
    jobs.push(...((data ?? []) as ExternalJobRow[]));
  }

  if (!provider || provider === "arbeidsplassen") {
    if (includeBroadCache) {
      const { data, error } = await admin
        .from("external_jobs")
        .select("*")
        .eq("status", "active")
        .eq("provider", "arbeidsplassen")
        .order("provider_updated_at", { ascending: false, nullsFirst: false })
        .limit(Math.ceil(CANDIDATE_POOL / 2));
      if (error) throw error;
      jobs.push(...((data ?? []) as ExternalJobRow[]));
    }
  }

  const seen = new Set<string>();
  return jobs.filter((job) => {
    if (seen.has(job.id)) return false;
    seen.add(job.id);
    return true;
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
      const materialized = await saveMatchToPipeline(admin, user.id, body.matchId);
      return json({ ok: true, jobId: materialized.jobId, ...materialized });
    }

    if (body.action === "dismiss-match") {
      if (!body.matchId) return json({ error: "matchId påkrevd" }, 400);
      await dismissMatch(admin, user.id, body.matchId, body.note);
      return json({ ok: true });
    }

    const limit = clampLimit(body.limit);
    const refresh = Boolean(body.refresh);
    const includeBroadCache = body.includeBroadCache !== false;
    const autoSaveVisible = body.autoSaveVisible !== false;
    const materializeExisting = Boolean(body.materializeExisting);
    const enableProfileSearch = body.profileSearch !== false;
    const provider = body.provider === "arbeidsplassen" || body.provider === "finn" ? body.provider : null;

    const [{ data: profile }, { data: cv }, { data: signals }, { data: feedback }, { data: visibilityRules }] =
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
        admin
          .from("match_visibility_rules")
          .select("*")
          .eq("user_id", user.id)
          .eq("is_active", true),
      ]);

    const { positiveTerms, negativeTerms } = buildProfileTerms(profile, cv, signals ?? [], feedback ?? []);
    const strongTerms = strongSearchTermsFromSignals(signals ?? []);
    const minVisibleScore = clampVisibleScore(body.minVisibleScore, profile?.match_min_visible_score ?? 65);
    const profileSuggestions = enableProfileSearch && provider !== "finn"
      ? await loadArbeidsplassenSuggestions(admin, user.id, signals ?? [], cv)
      : [];
    const profileSearch = profileSuggestions.length > 0
      ? await upsertArbeidsplassenProfileHits(admin, user.id, profileSuggestions)
      : { ids: new Set<string>(), searches: 0, found: 0, errors: 0 };

    const archivedBroadMatches = enableProfileSearch && !includeBroadCache && provider !== "finn"
      ? await archiveBroadArbeidsplassenMatches(admin, user.id)
      : 0;

    const [{ data: existingMatches }, externalJobs] = await Promise.all([
      admin.from("user_job_matches").select("*").eq("user_id", user.id),
      loadCandidateJobs(admin, user.id, provider, profileSearch.ids, includeBroadCache),
    ]);

    const existingByExternal = new Map<string, any>();
    for (const m of existingMatches ?? []) existingByExternal.set(m.external_job_id, m);

    const ranked = ((externalJobs ?? []) as ExternalJobRow[])
      .map((job) => {
        const existing = existingByExternal.get(job.id);
        const preVisibility = evaluateMatchVisibility(
          job,
          existing?.match_score ?? null,
          minVisibleScore,
          visibilityRules ?? [],
        );
        const isExcluded = Boolean(preVisibility.excludeRuleName);
        return {
          job,
          rank: isExcluded
            ? 1000
            : rankCandidate(job, positiveTerms, negativeTerms, {
                requiredTerms: strongTerms,
                requireStrongMatch: job.provider === "arbeidsplassen" && !preVisibility.includeRuleName,
              }) + visibilityRuleRankBoost(job, visibilityRules ?? []),
          existing,
          preVisibility,
        };
      })
      .filter(({ existing, preVisibility }) => {
        if (refresh || !existing || existing.status === "new") return true;
        return Boolean(preVisibility.excludeRuleName && existing.status !== "saved" && existing.status !== "dismissed");
      })
      .filter(({ job, rank, existing, preVisibility }) =>
        refresh ||
        preVisibility.excludeRuleName ||
        rank > 0 ||
        (job.provider === "finn" && !existing)
      )
      .sort((a, b) => b.rank - a.rank)
      .slice(0, limit);

    let scored = 0;
    let skipped = 0;
    let visible = 0;
    let hiddenBelowThreshold = 0;
    let includedByRule = 0;
    let excludedByRule = 0;
    let jobsCreated = 0;
    let jobsUpdated = 0;
    let materializedExisting = 0;
    const results: any[] = [];

    const recordMaterialized = (materialized: { created: boolean; updated: boolean }) => {
      if (materialized.created) jobsCreated++;
      else if (materialized.updated) jobsUpdated++;
    };

    for (const candidate of ranked) {
      const existing = candidate.existing;
      const discovery = (candidate.job.raw_data as any)?.discovery ?? null;
      const shouldRefreshProfileSearch = discovery?.source === "profile_search" && existing?.match_reasoning?.discovery?.source !== "profile_search";
      if (!refresh && existing?.computed_at && !shouldRefreshProfileSearch) {
        skipped++;
        continue;
      }

      const preVisibility = candidate.preVisibility;
      const existingStatus = existing?.status as string | undefined;
      if (preVisibility.excludeRuleName && existingStatus !== "saved" && existingStatus !== "dismissed") {
        const { data: saved, error: saveErr } = await admin
          .from("user_job_matches")
          .upsert(
            {
              user_id: user.id,
              external_job_id: candidate.job.id,
              job_id: existing?.job_id ?? null,
              match_score: existing?.match_score ?? null,
              score_professional: existing?.score_professional ?? null,
              score_culture: existing?.score_culture ?? null,
              score_practical: existing?.score_practical ?? null,
              score_enthusiasm: existing?.score_enthusiasm ?? null,
              match_reasoning: {
                ...(existing?.match_reasoning ?? {}),
                lexical_rank: candidate.rank,
                discovery,
                visibility: preVisibility,
              },
              risk_flags: existing?.risk_flags ?? [],
              status: "archived",
              computed_at: new Date().toISOString(),
            },
            { onConflict: "user_id,external_job_id" },
          )
          .select("id")
          .maybeSingle();
        if (saveErr) {
          skipped++;
          console.error("match exclude save failed", candidate.job.id, saveErr.message);
        } else {
          excludedByRule++;
          results.push({
            id: saved?.id,
            externalJobId: candidate.job.id,
            score: existing?.match_score ?? null,
            title: candidate.job.title,
            visibility: preVisibility,
          });
        }
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

      const matchVisibility = evaluateMatchVisibility(
        candidate.job,
        match.match_score,
        minVisibleScore,
        visibilityRules ?? [],
      );
      if (matchVisibility.visible) visible++;
      if (matchVisibility.hiddenBelowThreshold) hiddenBelowThreshold++;
      if (matchVisibility.includeRuleName) includedByRule++;

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
              discovery,
              visibility: matchVisibility,
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
        if (saved?.id && matchVisibility.visible && autoSaveVisible) {
          try {
            const materialized = await saveMatchToPipeline(admin, user.id, saved.id);
            recordMaterialized(materialized);
            if (existing?.id && !existing?.job_id) materializedExisting++;
          } catch (e) {
            skipped++;
            console.error("job materialization failed", candidate.job.id, (e as Error).message);
          }
        }
        results.push({
          id: saved?.id,
          externalJobId: candidate.job.id,
          score: match.match_score,
          title: candidate.job.title,
          visibility: matchVisibility,
        });
      }

      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    if (materializeExisting) {
      const { data: pendingMatches, error: pendingErr } = await admin
        .from("user_job_matches")
        .select("id,job_id,status,match_score,external_jobs(*)")
        .eq("user_id", user.id)
        .is("job_id", null)
        .in("status", ["new", "saved"])
        .order("match_score", { ascending: false, nullsFirst: false })
        .limit(MAX_LIMIT);
      if (pendingErr) throw pendingErr;

      for (const pending of pendingMatches ?? []) {
        const external = pending.external_jobs;
        if (!external) continue;
        const matchVisibility = evaluateMatchVisibility(
          external,
          pending.match_score,
          minVisibleScore,
          visibilityRules ?? [],
        );
        if (!matchVisibility.visible) continue;
        try {
          const materialized = await saveMatchToPipeline(admin, user.id, pending.id);
          recordMaterialized(materialized);
          materializedExisting++;
        } catch (e) {
          skipped++;
          console.error("existing match materialization failed", pending.id, (e as Error).message);
        }
      }
    }

    return json({
      ok: true,
      candidates: ranked.length,
      scored,
      visible,
      hiddenBelowThreshold,
      includedByRule,
      excludedByRule,
      skipped,
      results,
      profileSignals: signals?.length ?? 0,
      minVisibleScore,
      positiveTerms: positiveTerms.slice(0, 12),
      profileSearches: profileSearch.searches,
      profileSearchFound: profileSearch.found,
      profileSearchErrors: profileSearch.errors,
      archivedBroadMatches,
      jobsCreated,
      jobsUpdated,
      materializedExisting,
    });
  } catch (e) {
    console.error("match-user-jobs error", e);
    return json({ error: (e as Error).message }, 500);
  }
});
