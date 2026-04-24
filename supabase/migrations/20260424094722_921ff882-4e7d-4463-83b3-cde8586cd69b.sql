-- Auto-search configurations (profile-based job discovery without manual RSS)
CREATE TYPE public.auto_search_source AS ENUM ('finn', 'arbeidsplassen', 'linkedin');
CREATE TYPE public.auto_search_status AS ENUM ('ok', 'blocked', 'error', 'pending');

CREATE TABLE public.auto_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  source public.auto_search_source NOT NULL,
  query text NOT NULL DEFAULT '',
  location text,
  extra_params jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  last_checked_at timestamptz,
  last_status public.auto_search_status NOT NULL DEFAULT 'pending',
  last_error text,
  blocked_hint text,
  items_found integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.auto_searches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own auto searches" ON public.auto_searches
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own auto searches" ON public.auto_searches
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own auto searches" ON public.auto_searches
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own auto searches" ON public.auto_searches
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_auto_searches_updated_at
  BEFORE UPDATE ON public.auto_searches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_auto_searches_user_active ON public.auto_searches(user_id, is_active);