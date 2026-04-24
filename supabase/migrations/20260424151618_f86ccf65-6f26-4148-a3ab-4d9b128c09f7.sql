-- Create interest_level enum
DO $$ BEGIN
  CREATE TYPE public.job_interest_level AS ENUM ('none', 'uninterested', 'interested', 'very_interested');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add column with default 'none'
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS interest_level public.job_interest_level NOT NULL DEFAULT 'none';

-- Index for filtering
CREATE INDEX IF NOT EXISTS idx_jobs_interest_level ON public.jobs (user_id, interest_level);