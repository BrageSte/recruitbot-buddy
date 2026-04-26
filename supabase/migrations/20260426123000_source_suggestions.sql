-- AI-suggested source coverage: suggested Finn searches generated from profile/interests.

CREATE TYPE public.source_suggestion_provider AS ENUM ('finn');
CREATE TYPE public.source_suggestion_status AS ENUM ('suggested', 'active', 'paused', 'dismissed');

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS auto_source_suggestions_enabled boolean NOT NULL DEFAULT true;

CREATE TABLE public.source_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider public.source_suggestion_provider NOT NULL DEFAULT 'finn',
  name text NOT NULL,
  query text NOT NULL,
  location text,
  search_url text NOT NULL,
  rss_url text,
  reason text,
  confidence int NOT NULL DEFAULT 60 CHECK (confidence >= 0 AND confidence <= 100),
  status public.source_suggestion_status NOT NULL DEFAULT 'suggested',
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider, query, location)
);

ALTER TABLE public.source_suggestions ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_source_suggestions_user_status
  ON public.source_suggestions(user_id, status, is_active);

CREATE POLICY "Users view own source suggestions"
  ON public.source_suggestions FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own source suggestions"
  ON public.source_suggestions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own source suggestions"
  ON public.source_suggestions FOR UPDATE
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own source suggestions"
  ON public.source_suggestions FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_source_suggestions_updated_at
  BEFORE UPDATE ON public.source_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
