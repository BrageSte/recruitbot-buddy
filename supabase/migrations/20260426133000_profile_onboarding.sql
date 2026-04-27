-- Guided interest-profile onboarding.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_skipped_at timestamptz;

UPDATE public.profiles p
SET onboarding_completed_at = now()
WHERE p.onboarding_completed_at IS NULL
  AND (
    length(coalesce(p.master_profile, '')) > 40
    OR EXISTS (
      SELECT 1 FROM public.cv_templates c
      WHERE c.user_id = p.user_id
    )
    OR EXISTS (
      SELECT 1 FROM public.profile_interest_signals s
      WHERE s.user_id = p.user_id
    )
  );

CREATE TABLE public.profile_onboarding_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'questions', 'review', 'applying', 'completed', 'skipped')),
  current_step text NOT NULL DEFAULT 'cv'
    CHECK (current_step IN ('cv', 'questions', 'review', 'setup')),
  cv_draft jsonb NOT NULL DEFAULT '{}'::jsonb,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  profile_draft jsonb NOT NULL DEFAULT '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profile_onboarding_runs ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_profile_onboarding_runs_user_status
  ON public.profile_onboarding_runs(user_id, status, created_at DESC);

CREATE POLICY "Users view own onboarding runs"
  ON public.profile_onboarding_runs FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users insert own onboarding runs"
  ON public.profile_onboarding_runs FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own onboarding runs"
  ON public.profile_onboarding_runs FOR UPDATE
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users delete own onboarding runs"
  ON public.profile_onboarding_runs FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_profile_onboarding_runs_updated_at
  BEFORE UPDATE ON public.profile_onboarding_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
