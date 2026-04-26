-- Full-match engine: shared external job cache, per-user matches, profile signals and feedback.

CREATE TYPE public.external_job_provider AS ENUM ('arbeidsplassen', 'finn');
CREATE TYPE public.external_job_status AS ENUM ('active', 'inactive', 'unknown');
CREATE TYPE public.user_job_match_status AS ENUM ('new', 'saved', 'dismissed', 'archived');
CREATE TYPE public.profile_signal_category AS ENUM (
  'role',
  'industry',
  'task',
  'skill',
  'value',
  'work_style',
  'location',
  'dealbreaker',
  'other'
);
CREATE TYPE public.profile_signal_source AS ENUM (
  'manual',
  'cv',
  'application',
  'swipe',
  'ai_suggested'
);

ALTER TYPE public.job_source ADD VALUE IF NOT EXISTS 'arbeidsplassen';
ALTER TYPE public.job_source ADD VALUE IF NOT EXISTS 'finn';

CREATE TABLE public.external_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider public.external_job_provider NOT NULL,
  external_id text NOT NULL,
  source_url text,
  title text NOT NULL,
  company text,
  location text,
  description text,
  deadline date,
  status public.external_job_status NOT NULL DEFAULT 'unknown',
  raw_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider_updated_at timestamptz,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, external_id)
);

ALTER TABLE public.external_jobs ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_external_jobs_provider_status
  ON public.external_jobs(provider, status, provider_updated_at DESC NULLS LAST);
CREATE INDEX idx_external_jobs_status_fetched
  ON public.external_jobs(status, fetched_at DESC);
CREATE INDEX idx_external_jobs_deadline
  ON public.external_jobs(deadline)
  WHERE deadline IS NOT NULL;

CREATE POLICY "Authenticated users can view external jobs"
  ON public.external_jobs FOR SELECT
  TO authenticated
  USING (true);

CREATE TRIGGER update_external_jobs_updated_at
  BEFORE UPDATE ON public.external_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.source_ingest_state (
  provider public.external_job_provider PRIMARY KEY,
  last_checked_at timestamptz,
  last_modified_at timestamptz,
  last_feed_url text,
  last_status text NOT NULL DEFAULT 'pending',
  last_error text,
  last_run_stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.source_ingest_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view source ingest state"
  ON public.source_ingest_state FOR SELECT
  TO authenticated
  USING (true);

CREATE TRIGGER update_source_ingest_state_updated_at
  BEFORE UPDATE ON public.source_ingest_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.profile_interest_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL,
  category public.profile_signal_category NOT NULL DEFAULT 'other',
  weight int NOT NULL DEFAULT 50 CHECK (weight >= -100 AND weight <= 100),
  source public.profile_signal_source NOT NULL DEFAULT 'manual',
  confidence numeric(4,3) NOT NULL DEFAULT 1 CHECK (confidence >= 0 AND confidence <= 1),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, label, category)
);

ALTER TABLE public.profile_interest_signals ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_profile_interest_signals_user
  ON public.profile_interest_signals(user_id, category, weight DESC);

CREATE POLICY "Users view own profile signals"
  ON public.profile_interest_signals FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own profile signals"
  ON public.profile_interest_signals FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own profile signals"
  ON public.profile_interest_signals FOR UPDATE
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own profile signals"
  ON public.profile_interest_signals FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_profile_interest_signals_updated_at
  BEFORE UPDATE ON public.profile_interest_signals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.user_job_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  external_job_id uuid NOT NULL REFERENCES public.external_jobs(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  match_score int,
  score_professional int,
  score_culture int,
  score_practical int,
  score_enthusiasm int,
  match_reasoning jsonb NOT NULL DEFAULT '{}'::jsonb,
  risk_flags text[],
  status public.user_job_match_status NOT NULL DEFAULT 'new',
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, external_job_id)
);

ALTER TABLE public.user_job_matches ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_user_job_matches_user_status_score
  ON public.user_job_matches(user_id, status, match_score DESC NULLS LAST);
CREATE INDEX idx_user_job_matches_external
  ON public.user_job_matches(external_job_id);

CREATE POLICY "Users view own job matches"
  ON public.user_job_matches FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own job matches"
  ON public.user_job_matches FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own job matches"
  ON public.user_job_matches FOR UPDATE
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own job matches"
  ON public.user_job_matches FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_user_job_matches_updated_at
  BEFORE UPDATE ON public.user_job_matches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.job_score_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  external_job_id uuid REFERENCES public.external_jobs(id) ON DELETE CASCADE,
  user_job_match_id uuid REFERENCES public.user_job_matches(id) ON DELETE CASCADE,
  decision public.job_interest_level NOT NULL,
  original_score int,
  note text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.job_score_feedback ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_job_score_feedback_user
  ON public.job_score_feedback(user_id, created_at DESC);
CREATE INDEX idx_job_score_feedback_external
  ON public.job_score_feedback(external_job_id)
  WHERE external_job_id IS NOT NULL;

CREATE POLICY "Users view own score feedback"
  ON public.job_score_feedback FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own score feedback"
  ON public.job_score_feedback FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own score feedback"
  ON public.job_score_feedback FOR UPDATE
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own score feedback"
  ON public.job_score_feedback FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS external_job_id uuid REFERENCES public.external_jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS match_reasoning jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_jobs_external_job
  ON public.jobs(user_id, external_job_id)
  WHERE external_job_id IS NOT NULL;

-- Schedule broad Arbeidsplassen ingest. Matching itself stays user-triggered in the MVP,
-- because it is profile-specific and consumes AI calls.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  jid bigint;
BEGIN
  FOR jid IN SELECT jobid FROM cron.job WHERE jobname = 'ingest-arbeidsplassen-hourly'
  LOOP
    PERFORM cron.unschedule(jid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'ingest-arbeidsplassen-hourly',
  '20 * * * *',
  $$
  SELECT net.http_post(
    url:='https://ndhzxaamwoviqqwwfioe.supabase.co/functions/v1/ingest-arbeidsplassen-feed',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kaHp4YWFtd292aXFxd3dmaW9lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwMjE2MTUsImV4cCI6MjA5MjU5NzYxNX0.-b_V9aVEJdI6T5vahHW01fiU0SDQNO7jRX1q8ws1ufg"}'::jsonb,
    body:='{"maxPages": 5}'::jsonb
  );
  $$
);
