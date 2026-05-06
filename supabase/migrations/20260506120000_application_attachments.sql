-- Per-application attachments used as optional AI context.
-- Files live in the private user-files storage bucket under:
--   {user_id}/applications/{application_id}/{timestamp}-{filename}

CREATE TABLE IF NOT EXISTS public.application_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  mime_type text,
  size_bytes bigint,
  extracted_text text,
  ai_summary text,
  extraction_status text NOT NULL DEFAULT 'uploaded'
    CHECK (extraction_status IN ('uploaded', 'extracting', 'ready', 'failed')),
  extraction_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (storage_path)
);

ALTER TABLE public.application_attachments ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_application_attachments_application
  ON public.application_attachments(application_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_application_attachments_user
  ON public.application_attachments(user_id, created_at DESC);

CREATE TRIGGER update_application_attachments_updated_at
  BEFORE UPDATE ON public.application_attachments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Users view own application attachments"
  ON public.application_attachments FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.id = application_id
        AND a.user_id = auth.uid()
    )
  );

CREATE POLICY "Users insert own application attachments"
  ON public.application_attachments FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.id = application_id
        AND a.user_id = auth.uid()
    )
  );

CREATE POLICY "Users update own application attachments"
  ON public.application_attachments FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.id = application_id
        AND a.user_id = auth.uid()
    )
  );

CREATE POLICY "Users delete own application attachments"
  ON public.application_attachments FOR DELETE
  TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.id = application_id
        AND a.user_id = auth.uid()
    )
  );
