-- Add variant columns to cv_templates
ALTER TABLE public.cv_templates
  ADD COLUMN IF NOT EXISTS variant_name text NOT NULL DEFAULT 'Standard',
  ADD COLUMN IF NOT EXISTS variant_description text,
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

-- Mark existing active CV as the default for each user
UPDATE public.cv_templates
SET is_default = true
WHERE is_active = true;

-- Make all CVs active so old "is_active=true" filters still find them
UPDATE public.cv_templates
SET is_active = true
WHERE is_active = false;

-- Helpful index for default lookups
CREATE INDEX IF NOT EXISTS idx_cv_templates_user_default
  ON public.cv_templates(user_id, is_default);

-- Track which CV variant was used for each application
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS cv_template_id uuid;

CREATE INDEX IF NOT EXISTS idx_applications_cv_template_id
  ON public.applications(cv_template_id);