ALTER TABLE public.cv_templates
  ADD COLUMN IF NOT EXISTS section_order text[] NOT NULL
  DEFAULT ARRAY['experiences','education','skills','languages','projects','certifications']::text[];