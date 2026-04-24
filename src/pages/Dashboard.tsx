import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { ScoreBadge } from "@/components/ScoreBadge";
import {
  Briefcase,
  Send,
  Sparkles,
  Calendar as CalendarIcon,
  Target,
  Flame,
  AlertTriangle,
  Clock,
  Users,
  ChevronRight,
  ArrowRight,
  CheckCircle2,
  FileText,
} from "lucide-react";
import {
  startOfWeek,
  endOfWeek,
  addDays,
  parseISO,
  isBefore,
  isAfter,
  isSameDay,
  format,
  formatDistanceToNow,
  differenceInDays,
  isWithinInterval,
} from "date-fns";
import { nb } from "date-fns/locale";
import { cn } from "@/lib/utils";

type Job = {
  id: string;
  title: string;
  company: string | null;
  match_score: number | null;
  status: string;
  deadline: string | null;
  created_at: string;
};

type Application = {
  id: string;
  job_id: string;
  status: string;
  sent_at: string | null;
  generated_text: string | null;
  jobs: { title: string; company: string | null; deadline: string | null; match_score: number | null } | null;
};

type CalEvent = {
  id: string;
  title: string;
  kind: "interview" | "follow_up" | "note" | "custom";
  event_date: string;
  event_time: string | null;
  location: string | null;
  application_id: string | null;
  job_id: string | null;
};

type AgendaItem = {
  date: Date;
  kind: "deadline" | "interview" | "follow_up" | "milestone" | "sent" | "note" | "custom";
  title: string;
  subtitle?: string;
  href?: string;
  id: string;
  time?: string | null;
};

type UrgentItem = {
  id: string;
  reason: "deadline_soon" | "interview_tomorrow" | "follow_up_due" | "high_score_no_draft";
  title: string;
  subtitle?: string;
  meta?: string;
  href: string;
  score?: number | null;
};

const KIND_META: Record<AgendaItem["kind"], { label: string; icon: any; tone: string }> = {
  deadline: { label: "Frist", icon: AlertTriangle, tone: "text-orange-600 dark:text-orange-400" },
  interview: { label: "Intervju", icon: Users, tone: "text-purple-600 dark:text-purple-400" },
  follow_up: { label: "Oppfølging", icon: Clock, tone: "text-amber-600 dark:text-amber-400" },
  milestone: { label: "Delmål", icon: Target, tone: "text-emerald-600 dark:text-emerald-400" },
  sent: { label: "Sendt", icon: Send, tone: "text-blue-600 dark:text-blue-400" },
  note: { label: "Notat", icon: CalendarIcon, tone: "text-muted-foreground" },
  custom: { label: "Hendelse", icon: CalendarIcon, tone: "text-muted-foreground" },
};

const URGENT_META: Record<UrgentItem["reason"], { label: string; icon: any; tone: string }> = {
  deadline_soon: { label: "Frist nær", icon: AlertTriangle, tone: "text-orange-600 dark:text-orange-400 bg-orange-500/10 border-orange-500/30" },
  interview_tomorrow: { label: "Intervju i morgen", icon: Users, tone: "text-purple-600 dark:text-purple-400 bg-purple-500/10 border-purple-500/30" },
  follow_up_due: { label: "Oppfølging forfalt", icon: Clock, tone: "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30" },
  high_score_no_draft: { label: "Høy match – ingen utkast", icon: Flame, tone: "text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/30" },
};

const Dashboard = () => {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [apps, setApps] = useState<Application[]>([]);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from("jobs").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("applications").select("*, jobs(title, company, deadline, match_score)").eq("user_id", user.id),
      supabase.from("calendar_events").select("*").eq("user_id", user.id),
      supabase.from("goals").select("*").eq("user_id", user.id).neq("status", "archived").order("sort_order"),
      supabase.from("profiles").select("weekly_goal, display_name").eq("user_id", user.id).maybeSingle(),
    ]).then(([j, a, e, g, p]) => {
      setJobs((j.data ?? []) as any);
      setApps((a.data ?? []) as any);
      setEvents((e.data ?? []) as any);
      setGoals((g.data ?? []) as any);
      setProfile(p.data);
      setLoading(false);
    });
  }, [user]);

  const today = new Date();
  const tomorrow = addDays(today, 1);
  const in7days = addDays(today, 7);
  const in14days = addDays(today, 14);
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 });

  // ============= KPIs =============
  const sentThisWeek = apps.filter((a) => a.sent_at && new Date(a.sent_at) >= weekStart).length;
  const totalSent = apps.filter((a) => a.sent_at).length;
  const active = apps.filter((a) => ["sent", "response_received", "interview"].includes(a.status)).length;
  const interviews = apps.filter((a) => a.status === "interview").length;
  const goal = profile?.weekly_goal ?? 5;
  const goalPct = Math.min(100, Math.round((sentThisWeek / Math.max(1, goal)) * 100));

  const mainGoal = goals.find((g) => g.kind === "target_date" && g.status === "active");

  // ============= Job IDs already drafted/applied =============
  const drafted = useMemo(() => new Set(apps.map((a) => a.job_id)), [apps]);

  // ============= Top 5 MUST APPLY (highest score, not drafted, not archived) =============
  const mustApply = useMemo(() => {
    return jobs
      .filter((j) => !drafted.has(j.id) && !["archived", "rejected"].includes(j.status))
      .sort((a, b) => {
        // Prioritize: deadline soon AND high score
        const scoreA = a.match_score ?? 0;
        const scoreB = b.match_score ?? 0;
        const dlA = a.deadline ? differenceInDays(parseISO(a.deadline), today) : 999;
        const dlB = b.deadline ? differenceInDays(parseISO(b.deadline), today) : 999;
        // Combined urgency: closer deadline + higher score = first
        const urgencyA = scoreA - Math.max(0, dlA) * 2;
        const urgencyB = scoreB - Math.max(0, dlB) * 2;
        return urgencyB - urgencyA;
      })
      .slice(0, 5);
  }, [jobs, drafted]);

  // ============= New last 7 days (discovered, not in mustApply) =============
  const mustApplyIds = new Set(mustApply.map((j) => j.id));
  const newRecent = useMemo(() => {
    const sevenDaysAgo = addDays(today, -7);
    return jobs
      .filter(
        (j) =>
          !mustApplyIds.has(j.id) &&
          !drafted.has(j.id) &&
          isAfter(parseISO(j.created_at), sevenDaysAgo) &&
          !["archived", "rejected"].includes(j.status)
      )
      .sort((a, b) => (b.match_score ?? 0) - (a.match_score ?? 0))
      .slice(0, 8);
  }, [jobs, mustApplyIds, drafted]);

  // ============= Smart agenda =============
  const agenda = useMemo(() => {
    const items: AgendaItem[] = [];

    // Deadlines for jobs not yet applied
    jobs.forEach((j) => {
      if (!j.deadline) return;
      const d = parseISO(j.deadline);
      if (isBefore(d, today) && !isSameDay(d, today)) return;
      items.push({
        id: `dl-${j.id}`,
        date: d,
        kind: "deadline",
        title: j.title,
        subtitle: j.company ?? undefined,
        href: `/jobs/${j.id}`,
      });
    });

    // Sent applications (today/this week only — for log)
    apps.forEach((a) => {
      if (!a.sent_at) return;
      const d = parseISO(a.sent_at);
      if (isBefore(d, weekStart)) return;
      items.push({
        id: `sent-${a.id}`,
        date: d,
        kind: "sent",
        title: a.jobs?.title ?? "Søknad",
        subtitle: a.jobs?.company ?? undefined,
        href: `/applications/${a.id}`,
      });
    });

    // Calendar events
    events.forEach((e) => {
      const d = parseISO(e.event_date);
      if (isBefore(d, today) && !isSameDay(d, today)) return;
      items.push({
        id: `ev-${e.id}`,
        date: d,
        kind: e.kind === "interview" ? "interview" : e.kind === "follow_up" ? "follow_up" : e.kind === "note" ? "note" : "custom",
        title: e.title,
        subtitle: e.location ?? undefined,
        time: e.event_time,
        href: e.application_id ? `/applications/${e.application_id}` : e.job_id ? `/jobs/${e.job_id}` : undefined,
      });
    });

    // Milestones
    goals.forEach((g) => {
      if (g.kind !== "milestone" || !g.target_date) return;
      const d = parseISO(g.target_date);
      if (isBefore(d, today) && !isSameDay(d, today)) return;
      items.push({
        id: `g-${g.id}`,
        date: d,
        kind: "milestone",
        title: g.title,
        subtitle: g.target_count ? `${g.progress_count}/${g.target_count}` : undefined,
        href: "/calendar",
      });
    });

    return items.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [jobs, apps, events, goals]);

  // Smart grouping: Today / Tomorrow / This week / Next 30 days
  const agendaGroups = useMemo(() => {
    const todayItems = agenda.filter((i) => isSameDay(i.date, today));
    const tomorrowItems = agenda.filter((i) => isSameDay(i.date, tomorrow));
    const thisWeekItems = agenda.filter(
      (i) =>
        !isSameDay(i.date, today) &&
        !isSameDay(i.date, tomorrow) &&
        isWithinInterval(i.date, { start: today, end: weekEnd })
    );
    const next30Items = agenda.filter((i) => isAfter(i.date, weekEnd) && isBefore(i.date, addDays(today, 30)));
    return { todayItems, tomorrowItems, thisWeekItems, next30Items };
  }, [agenda]);

  // ============= Urgent =============
  const urgent = useMemo(() => {
    const out: UrgentItem[] = [];

    // Deadlines ≤ 7 days, not yet applied
    jobs.forEach((j) => {
      if (!j.deadline || drafted.has(j.id)) return;
      const d = parseISO(j.deadline);
      const days = differenceInDays(d, today);
      if (days < 0 || days > 7) return;
      out.push({
        id: `urg-dl-${j.id}`,
        reason: "deadline_soon",
        title: j.title,
        subtitle: j.company ?? undefined,
        meta: days === 0 ? "I dag" : days === 1 ? "I morgen" : `Om ${days} dager`,
        href: `/jobs/${j.id}`,
        score: j.match_score,
      });
    });

    // Interview tomorrow
    events.forEach((e) => {
      if (e.kind !== "interview") return;
      const d = parseISO(e.event_date);
      if (!isSameDay(d, tomorrow) && !isSameDay(d, today)) return;
      out.push({
        id: `urg-int-${e.id}`,
        reason: "interview_tomorrow",
        title: e.title,
        subtitle: e.location ?? undefined,
        meta: `${isSameDay(d, today) ? "I dag" : "I morgen"}${e.event_time ? ` kl. ${e.event_time.slice(0, 5)}` : ""}`,
        href: e.application_id ? `/applications/${e.application_id}` : "/calendar",
      });
    });

    // Follow-ups overdue (sent ≥ 10 days ago, no response yet)
    apps.forEach((a) => {
      if (!a.sent_at || a.status !== "sent") return;
      const sentDate = parseISO(a.sent_at);
      const days = differenceInDays(today, sentDate);
      if (days < 10) return;
      out.push({
        id: `urg-fu-${a.id}`,
        reason: "follow_up_due",
        title: a.jobs?.title ?? "Søknad",
        subtitle: a.jobs?.company ?? undefined,
        meta: `Sendt for ${days} dager siden`,
        href: `/applications/${a.id}`,
      });
    });

    // High score (≥80) without draft
    jobs.forEach((j) => {
      if (drafted.has(j.id)) return;
      if (["archived", "rejected"].includes(j.status)) return;
      if ((j.match_score ?? 0) < 80) return;
      // Skip if already in deadline_soon
      if (out.some((u) => u.id === `urg-dl-${j.id}`)) return;
      out.push({
        id: `urg-hi-${j.id}`,
        reason: "high_score_no_draft",
        title: j.title,
        subtitle: j.company ?? undefined,
        meta: `Score ${j.match_score}`,
        href: `/jobs/${j.id}`,
        score: j.match_score,
      });
    });

    return out.slice(0, 12);
  }, [jobs, apps, events, drafted]);

  if (loading) {
    return <div className="p-10 text-sm text-muted-foreground">Laster…</div>;
  }

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 lg:p-10 space-y-6">
      {/* Header */}
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold">
            Hei{profile?.display_name ? `, ${profile.display_name.split(" ")[0]}` : ""} 👋
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {urgent.length > 0
              ? `Du har ${urgent.length} ${urgent.length === 1 ? "ting" : "ting"} som haster i dag.`
              : "Alt under kontroll – tid for å se på nye muligheter."}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/calendar">
            <CalendarIcon className="w-4 h-4 mr-2" /> Full kalender
          </Link>
        </Button>
      </header>

      {/* Main goal banner (if exists) */}
      {mainGoal && (
        <Card className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-primary/30">
          <CardContent className="p-4 md:p-5 flex items-center justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <Badge variant="secondary" className="mb-1.5">
                <Target className="w-3 h-3 mr-1" /> Hovedmål
              </Badge>
              <h2 className="text-base md:text-lg font-semibold truncate">{mainGoal.title}</h2>
              {mainGoal.target_date && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {format(parseISO(mainGoal.target_date), "PPP", { locale: nb })} ·{" "}
                  {formatDistanceToNow(parseISO(mainGoal.target_date), { addSuffix: true, locale: nb })}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Denne uken</div>
                <div className="text-sm font-medium tabular-nums">
                  {sentThisWeek} / {goal}
                </div>
              </div>
              <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-gradient-primary transition-all" style={{ width: `${goalPct}%` }} />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi icon={Send} label="Sendt totalt" value={totalSent} sub={`${sentThisWeek} denne uken`} />
        <Kpi icon={Briefcase} label="Aktive" value={active} />
        <Kpi icon={Users} label="Intervjuer" value={interviews} />
        <Kpi
          icon={Sparkles}
          label="Nye matcher"
          value={jobs.filter((j) => j.status === "discovered" && (j.match_score ?? 0) >= 70).length}
          sub="≥ 70 score"
        />
      </div>

      {/* Three-column main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* COLUMN 1: Jobs to apply */}
        <div className="space-y-5">
          {/* Must apply – top 5 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Flame className="w-4 h-4 text-rose-500" /> Må søke nå
              </CardTitle>
              <p className="text-xs text-muted-foreground">Topp 5 basert på match og frist</p>
            </CardHeader>
            <CardContent className="pt-0 space-y-1.5">
              {mustApply.length === 0 ? (
                <EmptyState text="Ingen åpne høy-match jobber." linkText="Se alle jobber" linkTo="/jobs" />
              ) : (
                mustApply.map((j) => (
                  <Link
                    key={j.id}
                    to={`/jobs/${j.id}`}
                    className="flex items-center gap-2.5 p-2 -mx-1 rounded-md hover:bg-accent/50 transition-colors"
                  >
                    <ScoreBadge score={j.match_score} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{j.title}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {j.company}
                        {j.deadline && (
                          <>
                            {" "}
                            · <span className="text-orange-600 dark:text-orange-400">Frist {format(parseISO(j.deadline), "d. MMM", { locale: nb })}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </Link>
                ))
              )}
            </CardContent>
          </Card>

          {/* New last 7d */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" /> Nye siste 7 dager
              </CardTitle>
              <p className="text-xs text-muted-foreground">{newRecent.length} ferske annonser</p>
            </CardHeader>
            <CardContent className="pt-0 space-y-1.5">
              {newRecent.length === 0 ? (
                <EmptyState text="Ingen nye jobber siste uke." linkText="Sjekk kilder" linkTo="/sources" />
              ) : (
                <>
                  {newRecent.slice(0, 5).map((j) => (
                    <Link
                      key={j.id}
                      to={`/jobs/${j.id}`}
                      className="flex items-center gap-2.5 p-2 -mx-1 rounded-md hover:bg-accent/50 transition-colors"
                    >
                      <ScoreBadge score={j.match_score} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{j.title}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {j.company} · {formatDistanceToNow(parseISO(j.created_at), { addSuffix: true, locale: nb })}
                        </div>
                      </div>
                    </Link>
                  ))}
                  {newRecent.length > 5 && (
                    <Link to="/jobs" className="flex items-center justify-center gap-1 text-xs text-primary hover:underline pt-2">
                      Se alle {newRecent.length} <ArrowRight className="w-3 h-3" />
                    </Link>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* COLUMN 2: Smart agenda */}
        <Card className="lg:row-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-primary" /> Agenda
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {agendaGroups.todayItems.length > 0
                ? `${agendaGroups.todayItems.length} i dag`
                : agendaGroups.tomorrowItems.length > 0
                ? `Ingenting i dag, ${agendaGroups.tomorrowItems.length} i morgen`
                : agendaGroups.thisWeekItems.length > 0
                ? "Ingenting i dag eller i morgen"
                : "Ingenting denne uken"}
            </p>
          </CardHeader>
          <CardContent className="pt-0 space-y-4">
            <AgendaGroup label="I dag" items={agendaGroups.todayItems} emptyHint={agendaGroups.tomorrowItems.length === 0 && agendaGroups.thisWeekItems.length === 0} />
            <AgendaGroup label="I morgen" items={agendaGroups.tomorrowItems} hideIfEmpty />
            <AgendaGroup label="Senere denne uken" items={agendaGroups.thisWeekItems} hideIfEmpty />
            <AgendaGroup label="Neste 30 dager" items={agendaGroups.next30Items.slice(0, 5)} hideIfEmpty />

            {agenda.length === 0 && (
              <EmptyState text="Ingen kommende hendelser." linkText="Planlegg i kalender" linkTo="/calendar" />
            )}
          </CardContent>
        </Card>

        {/* COLUMN 3: Urgent */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-500" /> Haster
            </CardTitle>
            <p className="text-xs text-muted-foreground">{urgent.length} ting krever handling</p>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {urgent.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mb-2" />
                <p className="text-sm font-medium">Alt under kontroll</p>
                <p className="text-xs text-muted-foreground">Ingenting forfaller akkurat nå.</p>
              </div>
            ) : (
              urgent.map((u) => {
                const meta = URGENT_META[u.reason];
                const Icon = meta.icon;
                return (
                  <Link
                    key={u.id}
                    to={u.href}
                    className={cn("block p-2.5 rounded-lg border transition-colors hover:opacity-90", meta.tone)}
                  >
                    <div className="flex items-start gap-2.5">
                      <Icon className="w-4 h-4 mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-[10px] font-semibold uppercase tracking-wide">{meta.label}</span>
                          {u.score != null && (
                            <ScoreBadge score={u.score} className="text-[9px] px-1 py-0" />
                          )}
                        </div>
                        <div className="text-sm font-medium truncate">{u.title}</div>
                        <div className="text-xs opacity-75 truncate">
                          {u.subtitle}
                          {u.subtitle && u.meta && " · "}
                          {u.meta}
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Active applications quick link */}
      {active > 0 && (
        <Card>
          <CardContent className="p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <div>
                <div className="text-sm font-medium">{active} aktive søknader</div>
                <div className="text-xs text-muted-foreground">
                  {apps.filter((a) => a.status === "sent").length} sendt ·{" "}
                  {apps.filter((a) => a.status === "response_received").length} med svar ·{" "}
                  {interviews} intervju
                </div>
              </div>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link to="/applications">
                Se alle <ArrowRight className="w-4 h-4 ml-1" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

const Kpi = ({ icon: Icon, label, value, sub }: any) => (
  <Card>
    <CardContent className="p-3 md:p-4">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Icon className="w-3.5 h-3.5" /> {label}
        </span>
      </div>
      <div className="text-xl md:text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </CardContent>
  </Card>
);

const AgendaGroup = ({
  label,
  items,
  hideIfEmpty,
  emptyHint,
}: {
  label: string;
  items: AgendaItem[];
  hideIfEmpty?: boolean;
  emptyHint?: boolean;
}) => {
  if (items.length === 0) {
    if (hideIfEmpty) return null;
    if (emptyHint) {
      return (
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{label}</div>
          <p className="text-xs text-muted-foreground italic">Ingenting planlagt.</p>
        </div>
      );
    }
    return null;
  }
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{label}</div>
      <div className="space-y-1">
        {items.map((it) => {
          const meta = KIND_META[it.kind];
          const Icon = meta.icon;
          const inner = (
            <div className="flex items-start gap-2.5 p-1.5 -mx-1 rounded-md hover:bg-accent/50 transition-colors">
              <Icon className={cn("w-4 h-4 mt-0.5 shrink-0", meta.tone)} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{it.title}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {it.time && <span className="tabular-nums">{it.time.slice(0, 5)} · </span>}
                  {format(it.date, "EEE d. MMM", { locale: nb })}
                  {it.subtitle && ` · ${it.subtitle}`}
                </div>
              </div>
            </div>
          );
          return it.href ? (
            <Link key={it.id} to={it.href}>
              {inner}
            </Link>
          ) : (
            <div key={it.id}>{inner}</div>
          );
        })}
      </div>
    </div>
  );
};

const EmptyState = ({ text, linkText, linkTo }: { text: string; linkText: string; linkTo: string }) => (
  <div className="py-4 text-center">
    <p className="text-sm text-muted-foreground mb-2">{text}</p>
    <Link to={linkTo} className="text-xs text-primary hover:underline inline-flex items-center gap-1">
      {linkText} <ArrowRight className="w-3 h-3" />
    </Link>
  </div>
);

export default Dashboard;
