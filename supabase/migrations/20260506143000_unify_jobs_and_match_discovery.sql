-- Unify matcher discovery behind the Jobs surface.

ALTER TABLE public.source_ingest_state
  ADD COLUMN IF NOT EXISTS cursor_url text,
  ADD COLUMN IF NOT EXISTS pending_last_modified_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_etag text;

CREATE TABLE IF NOT EXISTS public.source_suggestion_hits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_suggestion_id uuid REFERENCES public.source_suggestions(id) ON DELETE CASCADE,
  rss_feed_id uuid REFERENCES public.rss_feeds(id) ON DELETE CASCADE,
  external_job_id uuid NOT NULL REFERENCES public.external_jobs(id) ON DELETE CASCADE,
  provider public.external_job_provider NOT NULL,
  query text NOT NULL,
  location text,
  rank int,
  score numeric,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  found_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (source_suggestion_id IS NOT NULL OR rss_feed_id IS NOT NULL)
);

ALTER TABLE public.source_suggestion_hits ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_source_suggestion_hits_user_provider_found
  ON public.source_suggestion_hits(user_id, provider, found_at DESC);

CREATE INDEX IF NOT EXISTS idx_source_suggestion_hits_external
  ON public.source_suggestion_hits(external_job_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_source_suggestion_hits_suggestion_unique
  ON public.source_suggestion_hits(user_id, source_suggestion_id, external_job_id)
  WHERE source_suggestion_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_source_suggestion_hits_rss_unique
  ON public.source_suggestion_hits(user_id, rss_feed_id, external_job_id)
  WHERE rss_feed_id IS NOT NULL;

CREATE POLICY "Users view own source suggestion hits"
  ON public.source_suggestion_hits FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users insert own source suggestion hits"
  ON public.source_suggestion_hits FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own source suggestion hits"
  ON public.source_suggestion_hits FOR UPDATE
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users delete own source suggestion hits"
  ON public.source_suggestion_hits FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_source_suggestion_hits_updated_at
  BEFORE UPDATE ON public.source_suggestion_hits
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
END $$;

SELECT cron.schedule(
  'daily-ingest-finn',
  '35 6 * * *',
  $$
  SELECT net.http_post(
    url:='https://ndhzxaamwoviqqwwfioe.supabase.co/functions/v1/ingest-finn',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kaHp4YWFtd292aXFxd3dmaW9lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwMjE2MTUsImV4cCI6MjA5MjU5NzYxNX0.-b_V9aVEJdI6T5vahHW01fiU0SDQNO7jRX1q8ws1ufg"}'::jsonb,
    body:='{"includeUserFeeds":true,"includeHtmlSuggestions":true,"maxSuggestionsPerUser":3,"maxHitsPerSuggestion":10}'::jsonb
  );
  $$
);
