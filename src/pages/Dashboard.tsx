import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  ArrowRight,
  CheckCircle2,
  Layers,
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

const KIND_LABEL: Record<AgendaItem["kind"], string> = {
  deadline: "Frist",
  interview: "Intervju",
  follow_up: "Oppfølging",
  milestone: "Delmål",
  sent: "Sendt",
  note: "Notat",
  custom: "Hendelse",
};

const URGENT_LABEL: Record<UrgentItem["reason"], string> = {
  deadline_soon: "Frist nær",
  interview_tomorrow: "Intervju",
  follow_up_due: "Oppfølging",
  high_score_no_draft: "Høy match",
};

// Subtle accent stripe color per urgent reason — only a 2px left border, no fill
const URGENT_STRIPE: Record<UrgentItem["reason"], string> = {
  deadline_soon: "border-l-orange-500",
  interview_tomorrow: "border-l-purple-500",
  follow_up_due: "border-l-amber-500",
  high_score_no_draft: "border-l-rose-500",
};

const Dashboard = () => {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [apps, setApps] = useState<Application[]>([]);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [highMatchNotifs, setHighMatchNotifs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from("jobs").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("applications").select("*, jobs(title, company, deadline, match_score)").eq("user_id", user.id),
      supabase.from("calendar_events").select("*").eq("user_id", user.id),
      supabase.from("goals").select("*").eq("user_id", user.id).neq("status", "archived").order("sort_order"),
      supabase.from("profiles").select("weekly_goal, display_name, notify_high_match_min_score").eq("user_id", user.id).maybeSingle(),
      supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .eq("kind", "high_match_job")
        .is("read_at", null)
        .order("created_at", { ascending: false })
        .limit(5),
    ]).then(([j, a, e, g, p, n]) => {
      setJobs((j.data ?? []) as any);
      setApps((a.data ?? []) as any);
      setEvents((e.data ?? []) as any);
      setGoals((g.data ?? []) as any);
      setProfile(p.data);
      setHighMatchNotifs((n.data ?? []) as any);
      setLoading(false);
    });
  }, [user]);

  const today = new Date();
  const tomorrow = addDays(today, 1);
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

  // ============= Top 5 MUST APPLY =============
  const mustApply = useMemo(() => {
    return jobs
      .filter((j) => !drafted.has(j.id) && !["archived", "rejected"].includes(j.status))
      .sort((a, b) => {
        const scoreA = a.match_score ?? 0;
        const scoreB = b.match_score ?? 0;
        const dlA = a.deadline ? differenceInDays(parseISO(a.deadline), today) : 999;
        const dlB = b.deadline ? differenceInDays(parseISO(b.deadline), today) : 999;
        const urgencyA = scoreA - Math.max(0, dlA) * 2;
        const urgencyB = scoreB - Math.max(0, dlB) * 2;
        return urgencyB - urgencyA;
      })
      .slice(0, 5);
  }, [jobs, drafted]);

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

    jobs.forEach((j) => {
      if (!j.deadline) return;
      if (["archived", "rejected"].includes(j.status)) return;
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

    jobs.forEach((j) => {
      if (!j.deadline || drafted.has(j.id)) return;
      if (["archived", "rejected"].includes(j.status)) return;
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

    jobs.forEach((j) => {
      if (drafted.has(j.id)) return;
      if (["archived", "rejected"].includes(j.status)) return;
      if ((j.match_score ?? 0) < 80) return;
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

  const newMatchCount = jobs.filter((j) => j.status === "discovered" && (j.match_score ?? 0) >= 70).length;

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 lg:p-10 space-y-8">
      {/* Header */}
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
            Hei{profile?.display_name ? `, ${profile.display_name.split(" ")[0]}` : ""}
          </h1>
          <p className="text-muted-foreground text-sm mt-1.5">
            {urgent.length > 0
              ? `${urgent.length} ${urgent.length === 1 ? "ting krever" : "ting krever"} handling i dag.`
              : "Alt under kontroll – tid for å se på nye muligheter."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" className="gap-1.5">
            <Link to="/jobs/swipe">
              <Layers className="w-3.5 h-3.5" />
              Sveip jobber
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
            <Link to="/calendar">
              Full kalender <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Link>
          </Button>
        </div>
      </header>

      {/* High-match alert banner */}
      {highMatchNotifs.length > 0 && (
        <Card className="border-primary/30 bg-gradient-to-r from-primary/5 to-transparent">
          <CardContent className="p-4 flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <h2 className="text-sm font-semibold">
                  {highMatchNotifs.length === 1
                    ? "1 ny topp-match"
                    : `${highMatchNotifs.length} nye topp-matcher`}{" "}
                  <span className="text-muted-foreground font-normal">
                    (≥ {profile?.notify_high_match_min_score ?? 90})
                  </span>
                </h2>
                <Link to="/jobs" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                  Se alle <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
              <ul className="mt-2 space-y-1">
                {highMatchNotifs.slice(0, 3).map((n) => (
                  <li key={n.id}>
                    <Link
                      to={n.job_id ? `/jobs/${n.job_id}` : "/jobs"}
                      className="text-sm hover:text-primary transition-colors inline-flex items-baseline gap-2 max-w-full"
                    >
                      <span className="text-[11px] font-semibold text-primary tabular-nums shrink-0">
                        {n.metadata?.score ?? "?"}
                      </span>
                      <span className="truncate">{n.title.replace(/^Ny match \d+\/100:\s*/, "")}</span>
                      {n.body && <span className="text-xs text-muted-foreground truncate hidden sm:inline">· {n.body}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Hovedmål — flat, minimal */}
      {mainGoal && (
        <Card>
          <CardContent className="p-4 md:p-5 flex items-center justify-between gap-4 flex-wrap">
            <div className="min-w-0 flex items-start gap-3">
              <Target className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Hovedmål</div>
                <h2 className="text-sm md:text-base font-semibold truncate mt-0.5">{mainGoal.title}</h2>
                {mainGoal.target_date && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {format(parseISO(mainGoal.target_date), "PPP", { locale: nb })} ·{" "}
                    {formatDistanceToNow(parseISO(mainGoal.target_date), { addSuffix: true, locale: nb })}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className="text-right">
                <div className="text-[11px] text-muted-foreground">Denne uken</div>
                <div className="text-sm font-medium tabular-nums">
                  {sentThisWeek} / {goal}
                </div>
              </div>
              <div className="w-24 h-1 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${goalPct}%` }} />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPI strip — én sammenhengende rad */}
      <Card>
        <div className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-border">
          <KpiCell label="Sendt totalt" value={totalSent} sub={`${sentThisWeek} denne uken`} href="/applications?tab=sent" />
          <KpiCell label="Aktive" value={active} href="/applications?tab=active" />
          <KpiCell label="Intervjuer" value={interviews} href="/applications?tab=responded" />
          <KpiCell label="Nye matcher" value={newMatchCount} sub="≥ 70 score" href="/jobs" />
        </div>
      </Card>

      {/* Three-column main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* COLUMN 1: Jobs to apply */}
        <div className="space-y-6">
          <Card>
            <SectionHeader icon={Flame} title="Må søke nå" hint="Topp 5 basert på match og frist" />
            <CardContent className="pt-0 space-y-0.5">
              {mustApply.length === 0 ? (
                <EmptyState text="Ingen åpne høy-match jobber." linkText="Se alle jobber" linkTo="/jobs" />
              ) : (
                mustApply.map((j) => (
                  <Link
                    key={j.id}
                    to={`/jobs/${j.id}`}
                    className="flex items-center gap-3 py-2 px-2 -mx-2 rounded-md hover:bg-accent/50 transition-colors"
                  >
                    <ScoreBadge score={j.match_score} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{j.title}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {j.company}
                        {j.deadline && (
                          <>
                            {" · "}
                            <span className="text-foreground/70">
                              Frist {format(parseISO(j.deadline), "d. MMM", { locale: nb })}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <SectionHeader icon={Sparkles} title="Nye siste 7 dager" hint={`${newRecent.length} ferske annonser`} />
            <CardContent className="pt-0 space-y-0.5">
              {newRecent.length === 0 ? (
                <EmptyState text="Ingen nye jobber siste uke." linkText="Sjekk kilder" linkTo="/sources" />
              ) : (
                <>
                  {newRecent.slice(0, 5).map((j) => (
                    <Link
                      key={j.id}
                      to={`/jobs/${j.id}`}
                      className="flex items-center gap-3 py-2 px-2 -mx-2 rounded-md hover:bg-accent/50 transition-colors"
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
                    <Link
                      to="/jobs"
                      className="flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors pt-3"
                    >
                      Se alle {newRecent.length} <ArrowRight className="w-3 h-3" />
                    </Link>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* COLUMN 2: Smart agenda */}
        <Card>
          <SectionHeader
            icon={CalendarIcon}
            title="Agenda"
            hint={
              agendaGroups.todayItems.length > 0
                ? `${agendaGroups.todayItems.length} i dag`
                : agendaGroups.tomorrowItems.length > 0
                ? `${agendaGroups.tomorrowItems.length} i morgen`
                : "Ingenting nært"
            }
          />
          <CardContent className="pt-0 space-y-5">
            <AgendaGroup
              label="I dag"
              items={agendaGroups.todayItems}
              emptyHint={agendaGroups.tomorrowItems.length === 0 && agendaGroups.thisWeekItems.length === 0}
            />
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
          <SectionHeader icon={AlertTriangle} title="Haster" hint={`${urgent.length} ${urgent.length === 1 ? "ting" : "ting"}`} />
          <CardContent className="pt-0 space-y-1">
            {urgent.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-500/80 mb-2" />
                <p className="text-sm font-medium">Alt under kontroll</p>
                <p className="text-xs text-muted-foreground mt-0.5">Ingenting forfaller akkurat nå.</p>
              </div>
            ) : (
              urgent.map((u) => (
                <Link
                  key={u.id}
                  to={u.href}
                  className={cn(
                    "block py-2 pl-3 pr-2 -mx-2 rounded-md border-l-2 hover:bg-accent/50 transition-colors",
                    URGENT_STRIPE[u.reason]
                  )}
                >
                  <div className="flex items-baseline justify-between gap-2 mb-0.5">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {URGENT_LABEL[u.reason]}
                    </span>
                    {u.meta && <span className="text-[11px] text-muted-foreground tabular-nums">{u.meta}</span>}
                  </div>
                  <div className="text-sm font-medium truncate">{u.title}</div>
                  {u.subtitle && <div className="text-xs text-muted-foreground truncate">{u.subtitle}</div>}
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

const KpiCell = ({
  label,
  value,
  sub,
  href,
}: {
  label: string;
  value: number | string;
  sub?: string;
  href?: string;
}) => {
  const inner = (
    <div className="p-4 md:p-5 transition-colors hover:bg-accent/30">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold tabular-nums mt-1">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
  return href ? (
    <Link to={href} className="block">
      {inner}
    </Link>
  ) : (
    inner
  );
};

const SectionHeader = ({ icon: Icon, title, hint }: { icon: any; title: string; hint?: string }) => (
  <CardHeader className="pb-3">
    <div className="flex items-center justify-between gap-2">
      <CardTitle className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5" />
        {title}
      </CardTitle>
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </div>
  </CardHeader>
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
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-2">{label}</div>
          <p className="text-xs text-muted-foreground italic">Ingenting planlagt.</p>
        </div>
      );
    }
    return null;
  }
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-2">{label}</div>
      <div className="space-y-0.5">
        {items.map((it) => {
          const inner = (
            <div className="flex items-baseline justify-between gap-3 py-1.5 px-2 -mx-2 rounded-md hover:bg-accent/50 transition-colors">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{it.title}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {KIND_LABEL[it.kind]}
                  {it.subtitle && ` · ${it.subtitle}`}
                </div>
              </div>
              <div className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                {it.time && <span>{it.time.slice(0, 5)} · </span>}
                {format(it.date, "d. MMM", { locale: nb })}
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
  <div className="py-6 text-center">
    <p className="text-sm text-muted-foreground mb-2">{text}</p>
    <Link to={linkTo} className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1">
      {linkText} <ArrowRight className="w-3 h-3" />
    </Link>
  </div>
);

export default Dashboard;
