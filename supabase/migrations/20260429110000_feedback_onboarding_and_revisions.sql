-- Feedback implementation: pre-auth onboarding handoff, setup persistence, LinkedIn import state,
-- and application revision history for regeneration/undo.

ALTER TABLE public.profile_onboarding_runs
  ADD COLUMN IF NOT EXISTS preauth_draft jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS linkedin_draft jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS setup_state jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.application_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  instruction text,
  source text NOT NULL DEFAULT 'regenerate'
    CHECK (source IN ('regenerate', 'edit', 'manual')),
  previous_text text NOT NULL DEFAULT '',
  next_text text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.application_revisions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_application_revisions_application
  ON public.application_revisions(application_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_application_revisions_user
  ON public.application_revisions(user_id, created_at DESC);

CREATE POLICY "Users view own application revisions"
  ON public.application_revisions FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users insert own application revisions"
  ON public.application_revisions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own application revisions"
  ON public.application_revisions FOR UPDATE
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users delete own application revisions"
  ON public.application_revisions FOR DELETE
  TO authenticated USING (auth.uid() = user_id);
