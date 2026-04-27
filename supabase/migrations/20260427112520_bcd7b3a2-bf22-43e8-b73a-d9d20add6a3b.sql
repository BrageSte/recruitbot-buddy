ALTER TABLE public.application_cv_tweaks
  ADD COLUMN IF NOT EXISTS tailored_cv jsonb,
  ADD COLUMN IF NOT EXISTS section_order text[];