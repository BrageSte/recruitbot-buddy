import {
  buildProfileTerms,
  clampVisibleScore,
  evaluateMatchVisibility,
  ExternalJobProvider,
  ExternalJobRow,
  MatchVisibilityRule,
  rankCandidate,
  scoreExternalJob,
  strongSearchTermsFromSignals,
  visibilityRuleRankBoost,
} from "./full-match.ts";

export const PRESERVED_MATCH_JOB_STATUSES = new Set(["applied", "interview", "offer", "rejected", "archived"]);

export type MatchContext = {
  profile: any;
  cv: any;
  signals: any[];
  feedback: any[];
  visibilityRules: MatchVisibilityRule[];
  positiveTerms: string[];
  negativeTerms: string[];
  strongTerms: string[];
  minVisibleScore: number;
  profileHash: string;
};

export type MaterializedJobResult = {
  jobId: string;
  created: boolean;
  updated: boolean;
  preservedStatus: string | null;
  preservedProtectedStatus: boolean;
  notified: boolean;
};

function normalizeForHash(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeForHash);
  if (!value || typeof value !== "object") return value ?? null;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    const v = (value as Record<string, unknown>)[key];
    if (typeof v === "undefined") continue;
    out[key] = normalizeForHash(v);
  }
  return out;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(normalizeForHash(value));
}

export function stableHash(value: unknown): string {
  const text = typeof value === "string" ? value : stableStringify(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `mh_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function stableSignals(signals: any[] = []) {
  return signals
    .map((signal) => ({
      label: String(signal?.label ?? "").trim().toLowerCase(),
      category: signal?.category ?? "other",
      weight: signal?.weight ?? 0,
      confidence: signal?.confidence ?? null,
      source: signal?.source ?? null,
      metadata: signal?.metadata ?? {},
    }))
    .sort((a, b) => `${a.category}|${a.label}|${a.weight}`.localeCompare(`${b.category}|${b.label}|${b.weight}`));
}

function stableVisibilityRules(rules: MatchVisibilityRule[] = []) {
  return rules
    .filter((rule) => rule.is_active !== false)
    .map((rule) => ({
      name: rule.name,
      action: rule.action,
      title_terms: rule.title_terms ?? [],
      company_terms: rule.company_terms ?? [],
      location_terms: rule.location_terms ?? [],
      description_terms: rule.description_terms ?? [],
      source_terms: rule.source_terms ?? [],
    }))
    .sort((a, b) => `${a.action}|${a.name}`.localeCompare(`${b.action}|${b.name}`));
}

export function buildProfileHash(profile: any, cv: any, signals: any[] = [], visibilityRules: MatchVisibilityRule[] = []) {
  return stableHash({
    profile: {
      master_profile: profile?.master_profile ?? "",
      rules_green: profile?.rules_green ?? "",
      rules_yellow: profile?.rules_yellow ?? "",
      rules_red: profile?.rules_red ?? "",
      match_min_visible_score: profile?.match_min_visible_score ?? 65,
      weight_professional: profile?.weight_professional ?? 40,
      weight_culture: profile?.weight_culture ?? 20,
      weight_practical: profile?.weight_practical ?? 20,
      weight_enthusiasm: profile?.weight_enthusiasm ?? 20,
    },
    cv: cv
      ? {
          headline: cv.headline ?? null,
          intro: cv.intro ?? null,
          location: cv.location ?? null,
          skills: cv.skills ?? [],
          experiences: cv.experiences ?? [],
          education: cv.education ?? [],
          projects: cv.projects ?? [],
          certifications: cv.certifications ?? [],
        }
      : null,
    signals: stableSignals(signals),
    visibilityRules: stableVisibilityRules(visibilityRules),
  });
}

export async function loadMatchContext(admin: any, userId: string, minVisibleScoreOverride?: unknown): Promise<MatchContext> {
  const [{ data: profile }, { data: cv }, { data: signals }, { data: feedback }, { data: visibilityRules }] =
    await Promise.all([
      admin.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
      admin
        .from("cv_templates")
        .select("*")
        .eq("user_id", userId)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
      admin.from("profile_interest_signals").select("*").eq("user_id", userId),
      admin
        .from("job_score_feedback")
        .select("decision, original_score, note, external_job_id")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(80),
      admin
        .from("match_visibility_rules")
        .select("*")
        .eq("user_id", userId)
        .eq("is_active", true),
    ]);

  const signalRows = signals ?? [];
  const feedbackRows = feedback ?? [];
  const rules = (visibilityRules ?? []) as MatchVisibilityRule[];
  const { positiveTerms, negativeTerms } = buildProfileTerms(profile, cv, signalRows, feedbackRows);

  return {
    profile,
    cv,
    signals: signalRows,
    feedback: feedbackRows,
    visibilityRules: rules,
    positiveTerms,
    negativeTerms,
    strongTerms: strongSearchTermsFromSignals(signalRows),
    minVisibleScore: clampVisibleScore(minVisibleScoreOverride, profile?.match_min_visible_score ?? 65),
    profileHash: buildProfileHash(profile, cv, signalRows, rules),
  };
}

export function matchStatusForJobStatus(status?: string | null) {
  if (status === "archived") return "archived";
  if (status === "rejected") return "dismissed";
  return "saved";
}

export function activeNotExpiredFilter<T extends { deadline?: string | null }>(job: T) {
  return !job.deadline || new Date(job.deadline).getTime() >= Date.now() - 86400000;
}

export function rankJobForContext(job: ExternalJobRow, context: MatchContext) {
  const preVisibility = evaluateMatchVisibility(
    job,
    null,
    context.minVisibleScore,
    context.visibilityRules,
  );
  const rank = preVisibility.excludeRuleName
    ? -1000
    : rankCandidate(job, context.positiveTerms, context.negativeTerms, {
        requiredTerms: context.strongTerms,
        requireStrongMatch: job.provider === "arbeidsplassen" && !preVisibility.includeRuleName,
      }) + visibilityRuleRankBoost(job, context.visibilityRules);
  return { rank, preVisibility };
}

export async function notifyHighMatchIfNeeded(
  admin: any,
  userId: string,
  jobId: string,
  title: string,
  company: string | null,
  location: string | null,
  score: number | null,
  metadata: Record<string, unknown>,
) {
  if (typeof score !== "number") return false;
  const { data: profile } = await admin
    .from("profiles")
    .select("notify_high_match_min_score")
    .eq("user_id", userId)
    .maybeSingle();
  const threshold = profile?.notify_high_match_min_score ?? 90;
  if (score < threshold) return false;

  const { data: existing } = await admin
    .from("notifications")
    .select("id")
    .eq("user_id", userId)
    .eq("job_id", jobId)
    .eq("kind", "high_match_job")
    .maybeSingle();
  if (existing?.id) return false;

  await admin.from("notifications").insert({
    user_id: userId,
    kind: "high_match_job",
    title: `Ny match ${score}/100: ${title}`,
    body: company ? `${company}${location ? ` · ${location}` : ""}` : location,
    job_id: jobId,
    metadata,
  });
  return true;
}

export async function saveMatchToPipeline(
  admin: any,
  userId: string,
  matchId: string,
  options: { notifyHighMatch?: boolean; notificationSource?: string } = {},
): Promise<MaterializedJobResult> {
  const { data: match, error: matchErr } = await admin
    .from("user_job_matches")
    .select("*, external_jobs(*)")
    .eq("id", matchId)
    .eq("user_id", userId)
    .maybeSingle();
  if (matchErr) throw matchErr;
  if (!match?.external_jobs) throw new Error("Match ikke funnet");

  const external = match.external_jobs;
  if (external.status !== "active" || !activeNotExpiredFilter(external)) {
    throw new Error("Jobben er ikke lenger aktiv eller søknadsfristen er utløpt.");
  }

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

  const notified = options.notifyHighMatch
    ? await notifyHighMatchIfNeeded(
        admin,
        userId,
        job.id,
        external.title,
        external.company,
        external.location,
        match.match_score,
        { score: match.match_score, source: options.notificationSource ?? "match-run", external_job_id: external.id },
      )
    : false;

  return {
    jobId: job.id,
    created: !existing,
    updated: Boolean(existing),
    preservedStatus: existing?.status ?? null,
    preservedProtectedStatus: PRESERVED_MATCH_JOB_STATUSES.has(existing?.status ?? ""),
    notified,
  };
}

export async function scoreAndStoreExternalJob(
  admin: any,
  userId: string,
  job: ExternalJobRow,
  context: MatchContext,
  lexicalRank: number,
  existing: any = null,
) {
  const match = await scoreExternalJob(
    job,
    context.profile,
    context.cv,
    context.signals,
    context.feedback,
    lexicalRank,
  );

  const matchVisibility = evaluateMatchVisibility(
    job,
    match.match_score,
    context.minVisibleScore,
    context.visibilityRules,
  );
  const status = existing?.status && existing.status !== "new" ? existing.status : "new";
  const discovery = (job.raw_data as any)?.discovery ?? null;

  const { data: saved, error } = await admin
    .from("user_job_matches")
    .upsert(
      {
        user_id: userId,
        external_job_id: job.id,
        job_id: existing?.job_id ?? null,
        match_score: match.match_score,
        score_professional: match.score_professional,
        score_culture: match.score_culture,
        score_practical: match.score_practical,
        score_enthusiasm: match.score_enthusiasm,
        match_reasoning: {
          ...match.match_reasoning,
          ai_summary: match.ai_summary,
          lexical_rank: lexicalRank,
          discovery,
          visibility: matchVisibility,
        },
        risk_flags: match.risk_flags,
        status,
        profile_hash: context.profileHash,
        computed_at: new Date().toISOString(),
      },
      { onConflict: "user_id,external_job_id" },
    )
    .select("id, match_score")
    .maybeSingle();
  if (error) throw error;

  return { saved, match, visibility: matchVisibility };
}

export async function ensureMatchRun(
  admin: any,
  userId: string,
  context: MatchContext,
  options: { provider?: ExternalJobProvider | null; mode?: string | null } = {},
) {
  const provider = options.provider ?? null;
  let existingQuery = admin
    .from("user_match_runs")
    .select("*")
    .eq("user_id", userId)
    .eq("profile_hash", context.profileHash)
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: false })
    .limit(1);
  if (provider) existingQuery = existingQuery.eq("provider", provider);
  else existingQuery = existingQuery.is("provider", null);

  const { data: existing } = await existingQuery.maybeSingle();
  if (existing?.id) return existing;

  let countQuery = admin
    .from("external_jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", "active");
  if (provider) countQuery = countQuery.eq("provider", provider);
  const { count } = await countQuery;

  const { data, error } = await admin
    .from("user_match_runs")
    .insert({
      user_id: userId,
      mode: options.mode ?? (provider ? "provider_scan" : "full_scan"),
      status: "queued",
      profile_hash: context.profileHash,
      provider,
      min_visible_score: context.minVisibleScore,
      total_estimate: count ?? 0,
    })
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data;
}
