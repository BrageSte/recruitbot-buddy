-- ============================================================
-- RSS FEEDS
-- ============================================================
CREATE TABLE public.rss_feeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_checked_at TIMESTAMPTZ,
  last_item_guid TEXT,
  items_found INT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.rss_feeds ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_feeds_active ON public.rss_feeds(is_active, last_checked_at);

CREATE POLICY "Users view own feeds" ON public.rss_feeds FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own feeds" ON public.rss_feeds FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own feeds" ON public.rss_feeds FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own feeds" ON public.rss_feeds FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_feeds_updated_at BEFORE UPDATE ON public.rss_feeds
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Track seen items per feed so we don't reimport
CREATE TABLE public.rss_seen_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_id UUID NOT NULL REFERENCES public.rss_feeds(id) ON DELETE CASCADE,
  guid TEXT NOT NULL,
  link TEXT,
  seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (feed_id, guid)
);
ALTER TABLE public.rss_seen_items ENABLE ROW LEVEL SECURITY;
-- No client policies — only edge functions (service role) write here.

-- ============================================================
-- CV TEMPLATES
-- ============================================================
CREATE TABLE public.cv_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  -- Header / contact
  full_name TEXT,
  headline TEXT,
  email TEXT,
  phone TEXT,
  location TEXT,
  linkedin_url TEXT,
  website_url TEXT,
  -- Body sections stored as structured JSON for easy editing + AI consumption
  intro TEXT DEFAULT '',
  experiences JSONB NOT NULL DEFAULT '[]'::jsonb,
  education JSONB NOT NULL DEFAULT '[]'::jsonb,
  skills JSONB NOT NULL DEFAULT '[]'::jsonb,
  languages JSONB NOT NULL DEFAULT '[]'::jsonb,
  projects JSONB NOT NULL DEFAULT '[]'::jsonb,
  certifications JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cv_templates ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_cv_user_active ON public.cv_templates(user_id, is_active);

CREATE POLICY "Users view own cv" ON public.cv_templates FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own cv" ON public.cv_templates FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own cv" ON public.cv_templates FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own cv" ON public.cv_templates FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_cv_updated_at BEFORE UPDATE ON public.cv_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- APPLICATION CV TWEAKS (AI-generated per application)
-- ============================================================
CREATE TABLE public.application_cv_tweaks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  application_id UUID NOT NULL UNIQUE REFERENCES public.applications(id) ON DELETE CASCADE,
  tailored_intro TEXT,
  highlight_experiences TEXT[],
  rephrase_suggestions JSONB DEFAULT '[]'::jsonb,
  prioritize_skills TEXT[],
  deemphasize TEXT[],
  notes TEXT,
  tailored_cv_markdown TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.application_cv_tweaks ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_cv_tweaks_app ON public.application_cv_tweaks(application_id);

CREATE POLICY "Users view own tweaks" ON public.application_cv_tweaks FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own tweaks" ON public.application_cv_tweaks FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own tweaks" ON public.application_cv_tweaks FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own tweaks" ON public.application_cv_tweaks FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_cv_tweaks_updated_at BEFORE UPDATE ON public.application_cv_tweaks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- SAVED FILTERS
-- ============================================================
CREATE TABLE public.saved_filters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.saved_filters ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_filters_user ON public.saved_filters(user_id, sort_order);

CREATE POLICY "Users view own filters" ON public.saved_filters FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own filters" ON public.saved_filters FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own filters" ON public.saved_filters FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own filters" ON public.saved_filters FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- AUTO-APPLY SETTINGS
-- ============================================================
CREATE TABLE public.auto_apply_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  min_score INT NOT NULL DEFAULT 80,
  exclude_with_risks BOOLEAN NOT NULL DEFAULT true,
  only_from_rss BOOLEAN NOT NULL DEFAULT false,
  daily_limit INT NOT NULL DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.auto_apply_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own auto settings" ON public.auto_apply_settings FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own auto settings" ON public.auto_apply_settings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own auto settings" ON public.auto_apply_settings FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_auto_settings_updated_at BEFORE UPDATE ON public.auto_apply_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Mark jobs that already triggered an auto-draft (so we don't repeat)
ALTER TABLE public.jobs ADD COLUMN auto_draft_at TIMESTAMPTZ;

-- ============================================================
-- CRON: poll RSS every 30 minutes
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'poll-rss-every-30min',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ndhzxaamwoviqqwwfioe.supabase.co/functions/v1/poll-rss',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kaHp4YWFtd292aXFxd3dmaW9lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwMjE2MTUsImV4cCI6MjA5MjU5NzYxNX0.-b_V9aVEJdI6T5vahHW01fiU0SDQNO7jRX1q8ws1ufg'),
    body := '{"source":"cron"}'::jsonb
  ) AS request_id;
  $$
);