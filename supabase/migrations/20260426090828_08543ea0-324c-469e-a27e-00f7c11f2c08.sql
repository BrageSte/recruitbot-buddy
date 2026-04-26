-- Notifications table for in-app notifications (high-match jobs, etc.)
CREATE TYPE public.notification_kind AS ENUM (
  'high_match_job',
  'deadline_soon',
  'interview_reminder',
  'system'
);

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind public.notification_kind NOT NULL,
  title text NOT NULL,
  body text,
  job_id uuid,
  application_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users update own notifications"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own notifications"
  ON public.notifications FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX idx_notifications_user_unread
  ON public.notifications (user_id, read_at, created_at DESC);

-- Add notification preferences to profiles (in-app always on; email/push for later)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notify_high_match_min_score integer NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS notify_email boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_push boolean NOT NULL DEFAULT false;

-- Schedule auto-runs: poll-rss + auto-search every hour
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove any pre-existing schedules with same names (idempotent)
DO $$
DECLARE
  jid bigint;
BEGIN
  FOR jid IN SELECT jobid FROM cron.job WHERE jobname IN ('hourly-poll-rss', 'hourly-auto-search')
  LOOP
    PERFORM cron.unschedule(jid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'hourly-poll-rss',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url:='https://ndhzxaamwoviqqwwfioe.supabase.co/functions/v1/poll-rss',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kaHp4YWFtd292aXFxd3dmaW9lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwMjE2MTUsImV4cCI6MjA5MjU5NzYxNX0.-b_V9aVEJdI6T5vahHW01fiU0SDQNO7jRX1q8ws1ufg"}'::jsonb,
    body:='{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'hourly-auto-search',
  '15 * * * *',
  $$
  SELECT net.http_post(
    url:='https://ndhzxaamwoviqqwwfioe.supabase.co/functions/v1/auto-search',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kaHp4YWFtd292aXFxd3dmaW9lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwMjE2MTUsImV4cCI6MjA5MjU5NzYxNX0.-b_V9aVEJdI6T5vahHW01fiU0SDQNO7jRX1q8ws1ufg"}'::jsonb,
    body:='{}'::jsonb
  );
  $$
);