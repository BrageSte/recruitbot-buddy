-- Goals (main goal + auto-generated weekly milestones)
CREATE TYPE public.goal_kind AS ENUM ('target_date', 'weekly_apps', 'milestone', 'custom');
CREATE TYPE public.goal_status AS ENUM ('active', 'completed', 'missed', 'archived');

CREATE TABLE public.goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  parent_goal_id uuid REFERENCES public.goals(id) ON DELETE CASCADE,
  kind public.goal_kind NOT NULL,
  title text NOT NULL,
  description text,
  target_date date,
  target_count integer,
  progress_count integer NOT NULL DEFAULT 0,
  status public.goal_status NOT NULL DEFAULT 'active',
  ai_generated boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own goals" ON public.goals
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own goals" ON public.goals
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own goals" ON public.goals
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own goals" ON public.goals
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_goals_updated_at
  BEFORE UPDATE ON public.goals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_goals_user_status ON public.goals(user_id, status);
CREATE INDEX idx_goals_user_target_date ON public.goals(user_id, target_date);

-- Calendar events (interviews, follow-ups, manual entries)
CREATE TYPE public.calendar_event_kind AS ENUM ('interview', 'follow_up', 'note', 'custom');

CREATE TABLE public.calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  application_id uuid REFERENCES public.applications(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  kind public.calendar_event_kind NOT NULL DEFAULT 'note',
  title text NOT NULL,
  description text,
  event_date date NOT NULL,
  event_time time,
  location text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own events" ON public.calendar_events
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own events" ON public.calendar_events
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own events" ON public.calendar_events
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own events" ON public.calendar_events
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_calendar_events_updated_at
  BEFORE UPDATE ON public.calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_calendar_events_user_date ON public.calendar_events(user_id, event_date);