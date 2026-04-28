-- Chat-based recruiter mapping step before onboarding setup.

ALTER TABLE public.profile_onboarding_runs
  ADD COLUMN IF NOT EXISTS chat_messages jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.profile_onboarding_runs
  DROP CONSTRAINT IF EXISTS profile_onboarding_runs_current_step_check;

ALTER TABLE public.profile_onboarding_runs
  ADD CONSTRAINT profile_onboarding_runs_current_step_check
  CHECK (current_step IN ('cv', 'questions', 'review', 'chat', 'setup'));
