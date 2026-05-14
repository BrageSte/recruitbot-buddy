-- AI control-plane usage log.
-- Stores provider/model/token/validation metadata only; raw prompts and CV/application text are intentionally not stored.

CREATE TABLE IF NOT EXISTS public.ai_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  feature text NOT NULL,
  provider text NOT NULL CHECK (provider IN ('openai', 'anthropic', 'lovable')),
  model text NOT NULL,
  mode text NOT NULL DEFAULT 'private',
  prompt_version text NOT NULL DEFAULT 'unknown',
  input_tokens int NOT NULL DEFAULT 0,
  output_tokens int NOT NULL DEFAULT 0,
  cache_read_tokens int NOT NULL DEFAULT 0,
  cache_write_tokens int NOT NULL DEFAULT 0,
  latency_ms int NOT NULL DEFAULT 0,
  validation_status text NOT NULL DEFAULT 'not_validated'
    CHECK (validation_status IN ('not_validated', 'passed', 'warning', 'failed', 'provider_error')),
  request_hash text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_runs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_ai_runs_user_created
  ON public.ai_runs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_runs_feature_created
  ON public.ai_runs(feature, created_at DESC);

CREATE POLICY "Users view own ai runs"
  ON public.ai_runs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own ai runs"
  ON public.ai_runs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users update own ai runs"
  ON public.ai_runs FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE VIEW public.ai_usage_log AS
SELECT
  id,
  user_id,
  feature,
  provider,
  model,
  mode,
  prompt_version,
  input_tokens,
  output_tokens,
  cache_read_tokens,
  cache_write_tokens,
  latency_ms,
  validation_status,
  error,
  created_at
FROM public.ai_runs;

CREATE OR REPLACE VIEW public.ai_usage_daily AS
SELECT
  user_id,
  feature,
  provider,
  model,
  date_trunc('day', created_at)::date AS day,
  count(*) AS run_count,
  sum(input_tokens) AS input_tokens,
  sum(output_tokens) AS output_tokens,
  sum(cache_read_tokens) AS cache_read_tokens,
  sum(cache_write_tokens) AS cache_write_tokens,
  avg(latency_ms)::int AS avg_latency_ms
FROM public.ai_runs
GROUP BY user_id, feature, provider, model, date_trunc('day', created_at)::date;
