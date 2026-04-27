-- Clear out tailored CV snapshots where the AI returned empty objects
-- in arrays (e.g. skills: [{}], languages: [{}], experiences: [{}]).
-- These cause the CV renderer to crash because g.items.join(...) is
-- called on undefined. Falling back to NULL means the UI will use the
-- original CV template, and the user can regenerate via "Tilpass CV".

UPDATE public.application_cv_tweaks
SET tailored_cv = NULL,
    section_order = NULL
WHERE tailored_cv IS NOT NULL
  AND (
    tailored_cv->'skills' @> '[{}]'::jsonb
    OR tailored_cv->'languages' @> '[{}]'::jsonb
    OR tailored_cv->'experiences' @> '[{}]'::jsonb
    OR tailored_cv->'education' @> '[{}]'::jsonb
    OR tailored_cv->'projects' @> '[{}]'::jsonb
    OR tailored_cv->'certifications' @> '[{}]'::jsonb
  );