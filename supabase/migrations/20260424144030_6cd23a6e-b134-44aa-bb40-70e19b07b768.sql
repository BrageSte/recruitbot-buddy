-- Add photo_url to cv_templates
ALTER TABLE public.cv_templates
ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- Create public bucket for CV photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('cv-photos', 'cv-photos', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policies on storage.objects for cv-photos bucket
CREATE POLICY "CV photos are publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'cv-photos');

CREATE POLICY "Users can upload their own CV photo"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'cv-photos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update their own CV photo"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'cv-photos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own CV photo"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'cv-photos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);