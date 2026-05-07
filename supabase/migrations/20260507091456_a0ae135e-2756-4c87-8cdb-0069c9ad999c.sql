CREATE TYPE public.match_visibility_rule_action AS ENUM ('include', 'exclude');

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS match_min_visible_score integer NOT NULL DEFAULT 65;

DO $$
BEGIN
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_match_min_visible_score_check
    CHECK (match_min_visible_score >= 0 AND match_min_visible_score <= 100);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE public.match_visibility_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  action public.match_visibility_rule_action NOT NULL DEFAULT 'include',
  title_terms text[] NOT NULL DEFAULT '{}'::text[],
  company_terms text[] NOT NULL DEFAULT '{}'::text[],
  location_terms text[] NOT NULL DEFAULT '{}'::text[],
  description_terms text[] NOT NULL DEFAULT '{}'::text[],
  source_terms text[] NOT NULL DEFAULT '{}'::text[],
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT match_visibility_rules_has_terms CHECK (
    cardinality(title_terms) > 0 OR
    cardinality(company_terms) > 0 OR
    cardinality(location_terms) > 0 OR
    cardinality(description_terms) > 0 OR
    cardinality(source_terms) > 0
  )
);

ALTER TABLE public.match_visibility_rules ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_match_visibility_rules_user_active
  ON public.match_visibility_rules(user_id, is_active, action);

CREATE POLICY "Users view own match visibility rules"
  ON public.match_visibility_rules FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own match visibility rules"
  ON public.match_visibility_rules FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own match visibility rules"
  ON public.match_visibility_rules FOR UPDATE
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own match visibility rules"
  ON public.match_visibility_rules FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_match_visibility_rules_updated_at
  BEFORE UPDATE ON public.match_visibility_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();