-- Hybrid match runs: fast first matches plus deterministic full-cache scans.

ALTER TABLE public.user_job_matches
  ADD COLUMN IF NOT EXISTS profile_hash text;

CREATE INDEX IF NOT EXISTS idx_user_job_matches_profile_hash
  ON public.user_job_matches(user_id, profile_hash, status, match_score DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_external_jobs_status_id
  ON public.external_jobs(status, id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_external_jobs_provider_status_id
  ON public.external_jobs(provider, status, id)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.user_match_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode text NOT NULL DEFAULT 'hybrid'
    CHECK (mode IN ('hybrid', 'full_scan', 'provider_scan', 'manual')),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  profile_hash text NOT NULL,
  provider public.external_job_provider,
  min_visible_score int NOT NULL DEFAULT 65 CHECK (min_visible_score >= 0 AND min_visible_score <= 100),
  total_estimate int NOT NULL DEFAULT 0 CHECK (total_estimate >= 0),
  scanned_count int NOT NULL DEFAULT 0 CHECK (scanned_count >= 0),
  candidate_count int NOT NULL DEFAULT 0 CHECK (candidate_count >= 0),
  scored_count int NOT NULL DEFAULT 0 CHECK (scored_count >= 0),
  visible_count int NOT NULL DEFAULT 0 CHECK (visible_count >= 0),
  jobs_created_count int NOT NULL DEFAULT 0 CHECK (jobs_created_count >= 0),
  cursor_external_job_id uuid,
  last_error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_match_runs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_user_match_runs_user_status_created
  ON public.user_match_runs(user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_match_runs_processing
  ON public.user_match_runs(status, created_at)
  WHERE status IN ('queued', 'running');

CREATE INDEX IF NOT EXISTS idx_user_match_runs_user_profile
  ON public.user_match_runs(user_id, profile_hash, created_at DESC);

CREATE POLICY "Users view own match runs"
  ON public.user_match_runs FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users insert own match runs"
  ON public.user_match_runs FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own match runs"
  ON public.user_match_runs FOR UPDATE
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users delete own match runs"
  ON public.user_match_runs FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_user_match_runs_updated_at
  BEFORE UPDATE ON public.user_match_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.user_match_run_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.user_match_runs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  external_job_id uuid NOT NULL REFERENCES public.external_jobs(id) ON DELETE CASCADE,
  lexical_rank numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'scored', 'skipped', 'failed')),
  match_id uuid REFERENCES public.user_job_matches(id) ON DELETE SET NULL,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, external_job_id)
);

ALTER TABLE public.user_match_run_candidates ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_user_match_run_candidates_run_status_rank
  ON public.user_match_run_candidates(run_id, status, lexical_rank DESC);

CREATE INDEX IF NOT EXISTS idx_user_match_run_candidates_user
  ON public.user_match_run_candidates(user_id, created_at DESC);

CREATE POLICY "Users view own match run candidates"
  ON public.user_match_run_candidates FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users insert own match run candidates"
  ON public.user_match_run_candidates FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own match run candidates"
  ON public.user_match_run_candidates FOR UPDATE
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users delete own match run candidates"
  ON public.user_match_run_candidates FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_user_match_run_candidates_updated_at
  BEFORE UPDATE ON public.user_match_run_candidates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  jid bigint;
BEGIN
  FOR jid IN SELECT jobid FROM cron.job WHERE jobname = 'daily-ingest-finn'
  LOOP
    PERFORM cron.unschedule(jid);
  END LOOP;

  FOR jid IN SELECT jobid FROM cron.job WHERE jobname = 'process-match-runs-every-minute'
  LOOP
    PERFORM cron.unschedule(jid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'daily-ingest-finn',
  '35 6 * * *',
  $$
  SELECT net.http_post(
    url:='https://ndhzxaamwoviqqwwfioe.supabase.co/functions/v1/ingest-finn',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kaHp4YWFtd292aXFxd3dmaW9lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwMjE2MTUsImV4cCI6MjA5MjU5NzYxNX0.-b_V9aVEJdI6T5vahHW01fiU0SDQNO7jRX1q8ws1ufg"}'::jsonb,
    body:='{"includeUserFeeds":true,"includeOfficialApi":false,"includeHtmlSuggestions":false,"maxSuggestionsPerUser":3,"maxHitsPerSuggestion":10}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'process-match-runs-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url:='https://ndhzxaamwoviqqwwfioe.supabase.co/functions/v1/process-match-runs',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kaHp4YWFtd292aXFxd3dmaW9lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwMjE2MTUsImV4cCI6MjA5MjU5NzYxNX0.-b_V9aVEJdI6T5vahHW01fiU0SDQNO7jRX1q8ws1ufg"}'::jsonb,
    body:='{"maxScanRows":500,"maxScore":25}'::jsonb
  );
  $$
);
