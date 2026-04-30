-- Per-application revision log for AI-tailored CV edits.
-- Kept separate from application_revisions because those rows restore
-- cover-letter text, while these rows restore structured CV snapshots.

CREATE TABLE IF NOT EXISTS public.application_cv_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  tweak_id uuid REFERENCES public.application_cv_tweaks(id) ON DELETE SET NULL,
  instruction text NOT NULL DEFAULT '',
  previous_cv jsonb NOT NULL DEFAULT '{}'::jsonb,
  next_cv jsonb NOT NULL DEFAULT '{}'::jsonb,
  previous_section_order text[],
  next_section_order text[],
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.application_cv_revisions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_application_cv_revisions_application
  ON public.application_cv_revisions(application_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_application_cv_revisions_user
  ON public.application_cv_revisions(user_id, created_at DESC);

CREATE POLICY "Users view own application CV revisions"
  ON public.application_cv_revisions FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users insert own application CV revisions"
  ON public.application_cv_revisions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own application CV revisions"
  ON public.application_cv_revisions FOR UPDATE
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users delete own application CV revisions"
  ON public.application_cv_revisions FOR DELETE
  TO authenticated USING (auth.uid() = user_id);
