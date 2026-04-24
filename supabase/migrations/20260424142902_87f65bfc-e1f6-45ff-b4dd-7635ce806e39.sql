CREATE TYPE public.cv_style AS ENUM ('skandinavisk','korporat','akademisk','startup','bold');

ALTER TABLE public.cv_templates
  ADD COLUMN cv_style public.cv_style NOT NULL DEFAULT 'skandinavisk';

ALTER TABLE public.applications
  ADD COLUMN cv_style public.cv_style;