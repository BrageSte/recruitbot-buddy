import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Loader2,
  Sparkles,
  Plus,
  Target,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Calendar as CalendarIcon,
  Briefcase,
  Send,
  Users,
  Trash2,
} from "lucide-react";
import { format, formatDistanceToNow, getISOWeek, isSameDay, isSameMonth, startOfWeek, endOfWeek, addDays, parseISO, differenceInDays, isBefore, isAfter } from "date-fns";
import { nb } from "date-fns/locale";

type Goal = {
  id: string;
  parent_goal_id: string | null;
  kind: "target_date" | "weekly_apps" | "milestone" | "custom";
  title: string;
  description: string | null;
  target_date: string | null;
  target_count: number | null;
  progress_count: number;
  status: "active" | "completed" | "missed" | "archived";
  ai_generated: boolean;
  sort_order: number;
};

type CalEvent = {
  id: string;
  application_id: string | null;
  job_id: string | null;
  kind: "interview" | "follow_up" | "note" | "custom";
  title: string;
  description: string | null;
  event_date: string;
  event_time: string | null;
  location: string | null;
};

type DerivedItem = {
  date: Date;
  kind: "deadline" | "sent" | "interview" | "follow_up" | "milestone" | "note" | "custom";
  title: string;
  subtitle?: string;
  href?: string;
  id: string;
};

const KIND_META: Record<DerivedItem["kind"], { label: string; icon: any; color: string }> = {
  deadline: { label: "Frist", icon: AlertTriangle, color: "text-orange-600 dark:text-orange-400" },
  sent: { label: "Sendt", icon: Send, color: "text-blue-600 dark:text-blue-400" },
  interview: { label: "Intervju", icon: Users, color: "text-purple-600 dark:text-purple-400" },
  follow_up: { label: "Oppfølging", icon: Clock, color: "text-amber-600 dark:text-amber-400" },
  milestone: { label: "Delmål", icon: Target, color: "text-emerald-600 dark:text-emerald-400" },
  note: { label: "Notat", icon: CalendarIcon, color: "text-muted-foreground" },
  custom: { label: "Hendelse", icon: CalendarIcon, color: "text-muted-foreground" },
};

const CalendarPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [jobs, setJobs] = useState<{ id: string; title: string; company: string | null; deadline: string | null }[]>([]);
  const [apps, setApps] = useState<{ id: string; job_id: string; sent_at: string | null; status: string; jobs: { title: string; company: string | null } | null }[]>([]);

  // Plan dialog
  const [planOpen, setPlanOpen] = useState(false);
  const [planDate, setPlanDate] = useState<Date | undefined>(undefined);
  const [planWeekly, setPlanWeekly] = useState<number>(5);
  const [planLoading, setPlanLoading] = useState(false);

  // Event dialog
  const [eventOpen, setEventOpen] = useState(false);
  const [evTitle, setEvTitle] = useState("");
  const [evKind, setEvKind] = useState<CalEvent["kind"]>("interview");
  const [evDate, setEvDate] = useState<Date | undefined>(undefined);
  const [evTime, setEvTime] = useState("");
  const [evLocation, setEvLocation] = useState("");
  const [evDescription, setEvDescription] = useState("");

  // Calendar grid
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  useEffect(() => { load(); }, [user]);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const [g, e, j, a] = await Promise.all([
      supabase.from("goals").select("*").eq("user_id", user.id).neq("status", "archived").order("sort_order"),
      supabase.from("calendar_events").select("*").eq("user_id", user.id).order("event_date"),
      supabase.from("jobs").select("id,title,company,deadline").eq("user_id", user.id).not("deadline", "is", null),
      supabase.from("applications").select("id,job_id,sent_at,status,jobs(title,company)").eq("user_id", user.id),
    ]);
    setGoals((g.data ?? []) as Goal[]);
    setEvents((e.data ?? []) as CalEvent[]);
    setJobs((j.data ?? []) as any);
    setApps((a.data ?? []) as any);
    setLoading(false);

    // Auto-update milestone progress for current week
    void updateMilestoneProgress((g.data ?? []) as Goal[], (a.data ?? []) as any);
  };

  const updateMilestoneProgress = async (goalsList: Goal[], appsList: any[]) => {
    if (!user) return;
    const now = new Date();
    for (const g of goalsList) {
      if (g.kind !== "milestone" || !g.target_date || !g.target_count) continue;
      const due = parseISO(g.target_date);
      const weekStart = startOfWeek(due, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(due, { weekStartsOn: 1 });
      const sentInWeek = appsList.filter((a) => {
        if (!a.sent_at) return false;
        const d = parseISO(a.sent_at);
        return d >= weekStart && d <= weekEnd;
      }).length;
      if (sentInWeek !== g.progress_count) {
        const newStatus =
          sentInWeek >= g.target_count ? "completed" :
          isBefore(due, now) ? "missed" : "active";
        await supabase.from("goals").update({ progress_count: sentInWeek, status: newStatus }).eq("id", g.id);
      }
    }
  };

  const generatePlan = async () => {
    if (!planDate) {
      toast({ title: "Velg en sluttdato", variant: "destructive" });
      return;
    }
    setPlanLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-plan", {
        body: { targetDate: planDate.toISOString().split("T")[0], weeklyApps: planWeekly },
      });
      if (error) throw error;
      toast({ title: "Plan generert", description: `${(data as any).milestonesCreated} delmål opprettet.` });
      setPlanOpen(false);
      load();
    } catch (e: any) {
      toast({ title: "Feilet", description: e.message, variant: "destructive" });
    } finally {
      setPlanLoading(false);
    }
  };

  const addEvent = async () => {
    if (!user || !evTitle.trim() || !evDate) {
      toast({ title: "Tittel og dato kreves", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("calendar_events").insert({
      user_id: user.id,
      title: evTitle.trim(),
      kind: evKind,
      event_date: evDate.toISOString().split("T")[0],
      event_time: evTime || null,
      location: evLocation || null,
      description: evDescription || null,
    });
    if (error) {
      toast({ title: "Feilet", description: error.message, variant: "destructive" });
    } else {
      setEvTitle(""); setEvDate(undefined); setEvTime(""); setEvLocation(""); setEvDescription("");
      setEventOpen(false);
      load();
    }
  };

  const deleteEvent = async (id: string) => {
    await supabase.from("calendar_events").delete().eq("id", id);
    load();
  };

  const deleteGoal = async (id: string) => {
    await supabase.from("goals").delete().eq("id", id);
    load();
  };

  // ============= Derived: combine all timeline items =============
  const allItems: DerivedItem[] = useMemo(() => {
    const out: DerivedItem[] = [];
    for (const j of jobs) {
      if (!j.deadline) continue;
      out.push({
        date: parseISO(j.deadline),
        kind: "deadline",
        title: j.title,
        subtitle: j.company ?? undefined,
        href: `/jobs/${j.id}`,
        id: `dl-${j.id}`,
      });
    }
    for (const a of apps) {
      if (!a.sent_at) continue;
      out.push({
        date: parseISO(a.sent_at),
        kind: "sent",
        title: a.jobs?.title ?? "Søknad",
        subtitle: a.jobs?.company ?? undefined,
        href: `/applications/${a.id}`,
        id: `sent-${a.id}`,
      });
    }
    for (const e of events) {
      out.push({
        date: parseISO(e.event_date),
        kind: e.kind === "interview" ? "interview" : e.kind === "follow_up" ? "follow_up" : e.kind === "note" ? "note" : "custom",
        title: e.title,
        subtitle: e.event_time ? `${e.event_time}${e.location ? ` · ${e.location}` : ""}` : e.location ?? undefined,
        id: `ev-${e.id}`,
      });
    }
    for (const g of goals) {
      if (g.kind !== "milestone" || !g.target_date) continue;
      out.push({
        date: parseISO(g.target_date),
        kind: "milestone",
        title: g.title,
        subtitle: g.target_count ? `${g.progress_count}/${g.target_count}` : undefined,
        id: `g-${g.id}`,
      });
    }
    return out.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [jobs, apps, events, goals]);

  const mainGoal = goals.find((g) => g.kind === "target_date" && g.status === "active");
  const milestones = goals.filter((g) => g.kind === "milestone").sort((a, b) =>
    (a.target_date ?? "").localeCompare(b.target_date ?? "")
  );

  // Timeline weeks: from today to main goal date (or +12 weeks)
  const timelineEnd = mainGoal?.target_date ? parseISO(mainGoal.target_date) : addDays(new Date(), 12 * 7);
  const totalDays = Math.max(7, differenceInDays(timelineEnd, new Date()));
  const totalWeeks = Math.ceil(totalDays / 7);
  const today = new Date();
  const overallProgress = mainGoal?.target_date
    ? Math.min(100, Math.max(0, ((Date.now() - new Date(mainGoal.created_at ?? today).getTime()) / (parseISO(mainGoal.target_date).getTime() - new Date(mainGoal.created_at ?? today).getTime())) * 100))
    : 0;

  // Map for calendar grid
  const itemsByDay = useMemo(() => {
    const m = new Map<string, DerivedItem[]>();
    for (const it of allItems) {
      const key = format(it.date, "yyyy-MM-dd");
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(it);
    }
    return m;
  }, [allItems]);

  const itemsForSelected = allItems.filter((i) => isSameDay(i.date, selectedDate));
  const upcoming = allItems.filter((i) => !isBefore(i.date, today)).slice(0, 12);

  if (loading) {
    return (
      <div className="p-10 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Laster…
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 lg:p-10 space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold">Fremdriftsplan</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Mål, frister og milepæler samlet ett sted – oppdateres automatisk når du søker jobber.
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={eventOpen} onOpenChange={setEventOpen}>
            <DialogTrigger asChild>
              <Button variant="outline"><Plus className="w-4 h-4 mr-2" /> Hendelse</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Ny hendelse</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Tittel</Label>
                  <Input value={evTitle} onChange={(e) => setEvTitle(e.target.value)} placeholder="Intervju med Acme" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select value={evKind} onValueChange={(v) => setEvKind(v as CalEvent["kind"])}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="interview">Intervju</SelectItem>
                        <SelectItem value="follow_up">Oppfølging</SelectItem>
                        <SelectItem value="note">Notat</SelectItem>
                        <SelectItem value="custom">Annet</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Klokkeslett</Label>
                    <Input type="time" value={evTime} onChange={(e) => setEvTime(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Dato</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start", !evDate && "text-muted-foreground")}>
                        <CalendarIcon className="w-4 h-4 mr-2" />
                        {evDate ? format(evDate, "PPP", { locale: nb }) : "Velg dato"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={evDate} onSelect={setEvDate} initialFocus className={cn("p-3 pointer-events-auto")} />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <Label>Sted (valgfritt)</Label>
                  <Input value={evLocation} onChange={(e) => setEvLocation(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Notater</Label>
                  <Textarea value={evDescription} onChange={(e) => setEvDescription(e.target.value)} rows={3} />
                </div>
                <Button onClick={addEvent} className="w-full">Lagre</Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={planOpen} onOpenChange={setPlanOpen}>
            <DialogTrigger asChild>
              <Button><Sparkles className="w-4 h-4 mr-2" /> Generer AI-plan</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>AI-fremdriftsplan</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  AI lager hovedmål + ukentlige delmål basert på profilen din. Erstatter eksisterende AI-genererte mål.
                </p>
                <div className="space-y-2">
                  <Label>Sluttdato (når vil du ha jobb?)</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start", !planDate && "text-muted-foreground")}>
                        <CalendarIcon className="w-4 h-4 mr-2" />
                        {planDate ? format(planDate, "PPP", { locale: nb }) : "Velg dato"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={planDate}
                        onSelect={setPlanDate}
                        initialFocus
                        disabled={(d) => d < new Date()}
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <Label>Ønsket søketempo (per uke)</Label>
                  <Input type="number" min={1} max={30} value={planWeekly} onChange={(e) => setPlanWeekly(Number(e.target.value))} />
                </div>
                <Button onClick={generatePlan} disabled={planLoading} className="w-full">
                  {planLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                  Generer plan
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      {/* Main goal banner */}
      {mainGoal ? (
        <Card className="bg-gradient-to-br from-primary/10 to-transparent border-primary/30">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Badge variant="secondary" className="mb-2"><Target className="w-3 h-3 mr-1" /> Hovedmål</Badge>
                <h2 className="text-xl font-semibold">{mainGoal.title}</h2>
                {mainGoal.description && <p className="text-sm text-muted-foreground mt-1">{mainGoal.description}</p>}
                {mainGoal.target_date && (
                  <p className="text-sm mt-2">
                    <span className="font-medium">{format(parseISO(mainGoal.target_date), "PPP", { locale: nb })}</span>
                    <span className="text-muted-foreground"> · {formatDistanceToNow(parseISO(mainGoal.target_date), { addSuffix: true, locale: nb })}</span>
                  </p>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={() => deleteGoal(mainGoal.id)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
            <Progress value={overallProgress} className="h-2" />
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center space-y-3">
            <Target className="w-8 h-8 mx-auto text-muted-foreground opacity-40" />
            <div>
              <p className="font-medium">Ingen aktiv plan ennå</p>
              <p className="text-sm text-muted-foreground">Generer en AI-fremdriftsplan for å sette mål og delmål.</p>
            </div>
            <Button onClick={() => setPlanOpen(true)}><Sparkles className="w-4 h-4 mr-2" /> Lag plan</Button>
          </CardContent>
        </Card>
      )}

      {/* Timeline strip */}
      {mainGoal && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Tidslinje</CardTitle></CardHeader>
          <CardContent>
            <div className="relative">
              <div className="flex gap-1 overflow-x-auto pb-2">
                {Array.from({ length: totalWeeks + 1 }).map((_, i) => {
                  const wkStart = startOfWeek(addDays(today, i * 7), { weekStartsOn: 1 });
                  const wkEnd = endOfWeek(wkStart, { weekStartsOn: 1 });
                  const wkNum = getISOWeek(wkStart);
                  const wkItems = allItems.filter((it) => it.date >= wkStart && it.date <= wkEnd);
                  const wkMilestone = milestones.find((m) => m.target_date && isSameDay(parseISO(m.target_date), endOfWeek(wkStart, { weekStartsOn: 1 })));
                  const isCurrent = today >= wkStart && today <= wkEnd;
                  return (
                    <div
                      key={i}
                      className={cn(
                        "min-w-[100px] flex-1 rounded-md border p-2 text-xs space-y-1",
                        isCurrent ? "border-primary bg-primary/5" : "border-border",
                        wkMilestone?.status === "completed" && "border-emerald-500/40 bg-emerald-500/5",
                        wkMilestone?.status === "missed" && "border-destructive/40 bg-destructive/5"
                      )}
                    >
                      <div className="font-medium">Uke {wkNum}</div>
                      <div className="text-muted-foreground text-[10px]">{format(wkStart, "d. MMM", { locale: nb })}</div>
                      {wkMilestone && (
                        <div className="pt-1 border-t border-border/50">
                          <div className="font-medium truncate">{wkMilestone.title}</div>
                          {wkMilestone.target_count != null && (
                            <div className="text-[10px] text-muted-foreground">
                              {wkMilestone.progress_count}/{wkMilestone.target_count}
                            </div>
                          )}
                        </div>
                      )}
                      {wkItems.length > 0 && !wkMilestone && (
                        <div className="text-muted-foreground text-[10px]">{wkItems.length} hendelse{wkItems.length === 1 ? "" : "r"}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="agenda" className="space-y-4">
        <TabsList>
          <TabsTrigger value="agenda">Agenda</TabsTrigger>
          <TabsTrigger value="calendar">Måned</TabsTrigger>
          <TabsTrigger value="milestones">Delmål</TabsTrigger>
        </TabsList>

        <TabsContent value="agenda" className="space-y-2">
          {upcoming.length === 0 ? (
            <Card><CardContent className="p-10 text-center text-muted-foreground text-sm">
              Ingen kommende hendelser.
            </CardContent></Card>
          ) : (
            upcoming.map((it) => {
              const meta = KIND_META[it.kind];
              const Icon = meta.icon;
              return (
                <Card key={it.id}>
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className={cn("w-10 h-10 rounded-md bg-muted flex items-center justify-center shrink-0", meta.color)}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{it.title}</span>
                        <Badge variant="outline" className="text-[10px]">{meta.label}</Badge>
                      </div>
                      {it.subtitle && <div className="text-xs text-muted-foreground truncate">{it.subtitle}</div>}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-medium">{format(it.date, "d. MMM", { locale: nb })}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {formatDistanceToNow(it.date, { addSuffix: true, locale: nb })}
                      </div>
                    </div>
                    {it.id.startsWith("ev-") && (
                      <Button variant="ghost" size="sm" onClick={() => deleteEvent(it.id.replace("ev-", ""))}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="calendar">
          <Card>
            <CardContent className="p-4 grid md:grid-cols-[auto,1fr] gap-6">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(d) => d && setSelectedDate(d)}
                locale={nb}
                weekStartsOn={1}
                modifiers={{
                  hasItems: (date) => itemsByDay.has(format(date, "yyyy-MM-dd")),
                }}
                modifiersClassNames={{
                  hasItems: "relative font-bold after:content-[''] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1 after:h-1 after:rounded-full after:bg-primary",
                }}
                className={cn("p-3 pointer-events-auto rounded-md border")}
              />
              <div className="space-y-2 min-w-0">
                <h3 className="font-medium">{format(selectedDate, "PPPP", { locale: nb })}</h3>
                {itemsForSelected.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Ingen hendelser denne dagen.</p>
                ) : (
                  itemsForSelected.map((it) => {
                    const meta = KIND_META[it.kind];
                    const Icon = meta.icon;
                    return (
                      <div key={it.id} className="flex items-start gap-3 p-2 rounded-md border">
                        <Icon className={cn("w-4 h-4 mt-0.5 shrink-0", meta.color)} />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{it.title}</div>
                          {it.subtitle && <div className="text-xs text-muted-foreground">{it.subtitle}</div>}
                        </div>
                        <Badge variant="outline" className="text-[10px]">{meta.label}</Badge>
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="milestones" className="space-y-2">
          {milestones.length === 0 ? (
            <Card><CardContent className="p-10 text-center text-muted-foreground text-sm">
              Ingen delmål ennå. Generer en AI-plan for å komme i gang.
            </CardContent></Card>
          ) : (
            milestones.map((m) => {
              const pct = m.target_count ? Math.min(100, (m.progress_count / m.target_count) * 100) : 0;
              const overdue = m.target_date && isBefore(parseISO(m.target_date), today) && m.status !== "completed";
              return (
                <Card key={m.id} className={cn(
                  m.status === "completed" && "border-emerald-500/40",
                  overdue && "border-destructive/40"
                )}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {m.status === "completed" ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          ) : overdue ? (
                            <AlertTriangle className="w-4 h-4 text-destructive" />
                          ) : (
                            <Target className="w-4 h-4 text-muted-foreground" />
                          )}
                          <span className="font-medium">{m.title}</span>
                          {m.target_date && (
                            <Badge variant="outline" className="text-[10px]">
                              Uke {getISOWeek(parseISO(m.target_date))} · {format(parseISO(m.target_date), "d. MMM", { locale: nb })}
                            </Badge>
                          )}
                        </div>
                        {m.description && <p className="text-xs text-muted-foreground mt-1">{m.description}</p>}
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => deleteGoal(m.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    {m.target_count != null && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Fremdrift</span>
                          <span>{m.progress_count} / {m.target_count}</span>
                        </div>
                        <Progress value={pct} className="h-1.5" />
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CalendarPage;
