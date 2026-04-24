import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScoreBadge } from "@/components/ScoreBadge";
import { Briefcase, Send, Sparkles, Calendar, Target, TrendingUp } from "lucide-react";
import { startOfWeek } from "date-fns";

const PIPELINE = [
  { v: "discovered", label: "Oppdaget" },
  { v: "considering", label: "Vurderer" },
  { v: "applied", label: "Søkt" },
  { v: "interview", label: "Intervju" },
  { v: "offer", label: "Tilbud" },
];

const Dashboard = () => {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<any[]>([]);
  const [apps, setApps] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from("jobs").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("applications").select("*").eq("user_id", user.id),
      supabase.from("profiles").select("weekly_goal").eq("user_id", user.id).maybeSingle(),
    ]).then(([j, a, p]) => {
      setJobs((j.data ?? []) as any);
      setApps((a.data ?? []) as any);
      setProfile(p.data);
    });
  }, [user]);

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const sentThisWeek = apps.filter((a) => a.sent_at && new Date(a.sent_at) >= weekStart).length;
  const totalSent = apps.filter((a) => a.sent_at).length;
  const active = apps.filter((a) => ["sent", "response_received", "interview"].includes(a.status)).length;
  const newMatches = jobs.filter((j) => j.status === "discovered" && (j.match_score ?? 0) >= 70).length;
  const interviews = apps.filter((a) => a.status === "interview").length;
  const goal = profile?.weekly_goal ?? 5;
  const goalPct = Math.min(100, Math.round((sentThisWeek / Math.max(1, goal)) * 100));

  return (
    <div className="max-w-7xl mx-auto p-6 lg:p-10 space-y-6">
      <header>
        <h1 className="text-3xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">Oversikt over din jobbsøkerpipeline.</p>
      </header>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi icon={Send} label="Sendt totalt" value={totalSent} sub={`${sentThisWeek} denne uken`} />
        <Kpi icon={Briefcase} label="Aktive" value={active} />
        <Kpi icon={Sparkles} label="Nye matcher" value={newMatches} sub="≥ 70 score" highlight={newMatches > 0} />
        <Kpi icon={Calendar} label="Intervjuer" value={interviews} />
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground flex items-center gap-1.5"><Target className="w-3.5 h-3.5" /> Ukesmål</span>
              <span className="text-xs tabular-nums font-medium">{sentThisWeek} / {goal}</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-gradient-primary transition-all" style={{ width: `${goalPct}%` }} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pipeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="w-4 h-4" /> Pipeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {PIPELINE.map((stage) => {
              const items = jobs.filter((j) => j.status === stage.v).slice(0, 5);
              const count = jobs.filter((j) => j.status === stage.v).length;
              return (
                <div key={stage.v} className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{stage.label}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
                  </div>
                  <div className="space-y-1.5 min-h-[100px]">
                    {items.length === 0 ? (
                      <div className="text-xs text-muted-foreground/60 italic px-1">Tom</div>
                    ) : items.map((j) => (
                      <Link key={j.id} to={`/jobs/${j.id}`}>
                        <div className="p-2.5 rounded-md border border-border bg-card hover:shadow-card transition-shadow">
                          <div className="flex items-start gap-2">
                            <ScoreBadge score={j.match_score} className="text-[10px] px-1.5 py-0 mt-0.5" />
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-medium truncate">{j.title}</div>
                              <div className="text-[11px] text-muted-foreground truncate">{j.company}</div>
                            </div>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Top matches */}
      <Card>
        <CardHeader><CardTitle className="text-base">Beste nye matcher</CardTitle></CardHeader>
        <CardContent>
          {jobs.filter((j) => j.status === "discovered").sort((a, b) => (b.match_score ?? 0) - (a.match_score ?? 0)).slice(0, 5).map((j) => (
            <Link key={j.id} to={`/jobs/${j.id}`} className="flex items-center gap-3 py-2.5 border-b border-border last:border-0 hover:bg-accent/30 -mx-2 px-2 rounded">
              <ScoreBadge score={j.match_score} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{j.title}</div>
                <div className="text-xs text-muted-foreground truncate">{j.company}</div>
              </div>
            </Link>
          ))}
          {jobs.filter((j) => j.status === "discovered").length === 0 && (
            <p className="text-sm text-muted-foreground py-6 text-center">Ingen nye jobber. Legg til en fra <Link to="/jobs" className="text-primary underline">Jobber</Link>.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const Kpi = ({ icon: Icon, label, value, sub, highlight }: any) => (
  <Card className={highlight ? "border-primary/40" : ""}>
    <CardContent className="p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground flex items-center gap-1.5"><Icon className="w-3.5 h-3.5" /> {label}</span>
      </div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </CardContent>
  </Card>
);

export default Dashboard;
