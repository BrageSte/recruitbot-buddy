// Backfills missing AI enrichment for jobs that were inserted without it
// (e.g. when AI gateway was rate-limited during auto-search/poll-rss).
// Picks up to 10 oldest jobs missing match_score and re-runs aiParse.
//
// Triggered hourly via pg_cron, or manually from the Jobs page.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { aiParse, fetchJobText, weightedScore } from "../auto-search/enrich.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 10;
const THROTTLE_MS = 400;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Optional: scope to one user when called from the UI
  let scopedUserId: string | null = null;
  const authHeader = req.headers.get("Authorization");
  if (authHeader && !authHeader.includes(Deno.env.get("SUPABASE_ANON_KEY") ?? "___")) {
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: u } = await userClient.auth.getUser();
    if (u.user) scopedUserId = u.user.id;
  }

  // Pick jobs that look like they were inserted without AI enrichment
  let q = admin
    .from("jobs")
    .select("id, user_id, title, company, location, source_url, description")
    .is("match_score", null)
    .in("source", ["auto_search", "rss", "url", "linkedin"])
    .not("source_url", "is", null)
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);
  if (scopedUserId) q = q.eq("user_id", scopedUserId);

  const { data: jobs, error } = await q;
  if (error) return json({ error: error.message }, 500);
  if (!jobs || jobs.length === 0) {
    return json({ ok: true, enriched: 0, skipped: 0, remaining: 0 });
  }

  // Pre-load profiles per user (usually one or two)
  const userIds = Array.from(new Set(jobs.map((j) => j.user_id)));
  const profileById = new Map<string, any>();
  for (const uid of userIds) {
    const { data: p } = await admin.from("profiles").select("*").eq("user_id", uid).maybeSingle();
    profileById.set(uid, p);
  }

  let enriched = 0;
  let skipped = 0;
  let stoppedNoCredits = false;

  for (const job of jobs) {
    if (stoppedNoCredits) break;

    const profile = profileById.get(job.user_id);
    const baseText = `${job.title}\n${job.company ?? ""}\n${job.location ?? ""}\n${job.description ?? ""}`;
    const fullText = await fetchJobText(job.source_url!, baseText);
    const aiResult = await aiParse(fullText, job.source_url, profile);

    await new Promise((r) => setTimeout(r, THROTTLE_MS));

    if (!aiResult.ok) {
      if (aiResult.reason === "no_credits") {
        stoppedNoCredits = true;
        console.error("enrich-jobs: stopping, no AI credits");
        break;
      }
      skipped++;
      continue;
    }

    const parsed = aiResult.parsed;
    const totalScore = weightedScore(parsed, profile);
    const highMatchThreshold = (profile as any)?.notify_high_match_min_score ?? 90;

    const { error: updErr } = await admin
      .from("jobs")
      .update({
        title: parsed.title || job.title,
        company: parsed.company || job.company || null,
        location: parsed.location || job.location || null,
        description: parsed.description ?? job.description ?? null,
        ai_summary: parsed.ai_summary,
        deadline: parsed.deadline && /^\d{4}-\d{2}-\d{2}$/.test(parsed.deadline) ? parsed.deadline : null,
        match_score: totalScore,
        score_professional: parsed.score_professional,
        score_culture: parsed.score_culture,
        score_practical: parsed.score_practical,
        score_enthusiasm: parsed.score_enthusiasm,
        risk_flags: parsed.risk_flags ?? [],
      })
      .eq("id", job.id);

    if (updErr) {
      console.error("enrich-jobs: update failed", updErr.message);
      skipped++;
      continue;
    }

    enriched++;

    if (totalScore >= highMatchThreshold) {
      // Skip if a notification for this job already exists
      const { data: existingNotif } = await admin
        .from("notifications")
        .select("id")
        .eq("user_id", job.user_id)
        .eq("job_id", job.id)
        .eq("kind", "high_match_job")
        .maybeSingle();
      if (!existingNotif) {
        await admin.from("notifications").insert({
          user_id: job.user_id,
          kind: "high_match_job",
          title: `Ny match ${totalScore}/100: ${parsed.title || job.title}`,
          body: parsed.company
            ? `${parsed.company}${parsed.location ? ` · ${parsed.location}` : ""}`
            : (parsed.location ?? null),
          job_id: job.id,
          metadata: { score: totalScore, source: "enrich-jobs" },
        });
      }
    }
  }

  // Count remaining
  let remainingQ = admin
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .is("match_score", null)
    .in("source", ["auto_search", "rss", "url", "linkedin"])
    .not("source_url", "is", null);
  if (scopedUserId) remainingQ = remainingQ.eq("user_id", scopedUserId);
  const { count: remaining } = await remainingQ;

  return json({ ok: true, enriched, skipped, remaining: remaining ?? 0, stoppedNoCredits });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
