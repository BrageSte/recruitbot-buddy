-- Let profile-generated source suggestions target Arbeidsplassen as well as Finn.

ALTER TYPE public.source_suggestion_provider
  ADD VALUE IF NOT EXISTS 'arbeidsplassen';
