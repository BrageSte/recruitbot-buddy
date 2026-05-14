-- Keep the public cron endpoint fail-closed without committing a secret.
--
-- Production setup must set the same generated value in both places:
--   supabase secrets set PROCESS_MATCH_RUNS_CRON_SECRET=<secret>
--   select vault.create_secret('<secret>', 'process_match_runs_cron_secret');

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

DO $$
DECLARE
  jid bigint;
BEGIN
  FOR jid IN SELECT jobid FROM cron.job WHERE jobname = 'process-match-runs-every-minute'
  LOOP
    PERFORM cron.unschedule(jid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'process-match-runs-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url:='https://ndhzxaamwoviqqwwfioe.supabase.co/functions/v1/process-match-runs',
    headers:=jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kaHp4YWFtd292aXFxd3dmaW9lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwMjE2MTUsImV4cCI6MjA5MjU5NzYxNX0.-b_V9aVEJdI6T5vahHW01fiU0SDQNO7jRX1q8ws1ufg',
      'X-Cron-Secret', (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'process_match_runs_cron_secret'
        LIMIT 1
      )
    ),
    body:='{"maxScanRows":500,"maxScore":25}'::jsonb
  );
  $$
);
