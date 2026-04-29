import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ScoreBadge } from "@/components/ScoreBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { evaluateMatchVisibility, type MatchVisibilityRule, type MatchVisibilityResult } from "@/lib/matchVisibility";
import {
  AlertTriangle,
  ArrowRight,
  Briefcase,
  Check,
  Database,
  ExternalLink,
  Loader2,
  Radar,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { nb } from "date-fns/locale";

type MatchRow = any;
type Provider = "arbeidsplassen" | "finn";

const PROVIDER_LABEL: Record<Provider, string> = {
  arbeidsplassen: "Arbeidsplassen",
  finn: "Finn",
};

const CATEGORY_TONE: Record<string, string> = {
  arbeidsplassen: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  finn: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
};

const Matches = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [states, setStates] = useState<any[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [visibilityRules, setVisibilityRules] = useState<MatchVisibilityRule[]>([]);
  const [profileMinScore, setProfileMinScore] = useState(65);
  const [minScore, setMinScore] = useState(65);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [ingesting, setIngesting] = useState<Provider | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, [user]);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const [matchRes, stateRes, arbeidsplassenCount, finnCount, profileRes, rulesRes] = await Promise.all([
      supabase
        .from("user_job_matches")
        .select("*, external_jobs(*)")
        .eq("user_id", user.id)
        .neq("status", "dismissed" as any)
        .order("match_score", { ascending: false, nullsFirst: false })
        .limit(80),
      supabase.from("source_ingest_state").select("*"),
      supabase
        .from("external_jobs")
        .select("id", { count: "exact", head: true })
        .eq("provider", "arbeidsplassen" as any)
        .eq("status", "active" as any),
      supabase
        .from("external_jobs")
        .select("id", { count: "exact", head: true })
        .eq("provider", "finn" as any)
        .eq("status", "active" as any),
      supabase.from("profiles").select("match_min_visible_score").eq("user_id", user.id).maybeSingle(),
      supabase
        .from("match_visibility_rules")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true),
    ]);
    setMatches((matchRes.data ?? []) as any[]);
    setStates(stateRes.data ?? []);
    setVisibilityRules((rulesRes.data ?? []) as any[]);
    const nextMinScore = (profileRes.data as any)?.match_min_visible_score ?? 65;
    setProfileMinScore(nextMinScore);
    setMinScore((current) => (current === 65 ? nextMinScore : current));
    setCounts({
      arbeidsplassen: arbeidsplassenCount.count ?? 0,
      finn: finnCount.count ?? 0,
    });
    setLoading(false);
  };

  const decoratedMatches = useMemo(
    () =>
      matches.map((match) => {
        const job = match.external_jobs ?? {};
        const liveVisibility = evaluateMatchVisibility(
          {
            title: job.title,
            company: job.company,
            location: job.location,
            description: job.description,
            provider: job.provider,
          },
          match.match_score,
          minScore,
          visibilityRules,
        );
        const storedVisibility = match.match_reasoning?.visibility ?? {};
        const visibility: MatchVisibilityResult = {
          ...liveVisibility,
          includeRuleName: liveVisibility.includeRuleName ?? storedVisibility.includeRuleName ?? null,
          excludeRuleName: liveVisibility.excludeRuleName ?? storedVisibility.excludeRuleName ?? null,
        };
        const passesFilter = visibility.visible && !visibility.excludeRuleName && match.status !== "archived";
        return { ...match, _visibility: visibility, _passesFilter: passesFilter };
      }),
    [matches, minScore, visibilityRules],
  );

  const activeMatches = useMemo(
    () => decoratedMatches.filter((m) => m.status !== "archived"),
    [decoratedMatches],
  );

  const topMatches = useMemo(
    () => activeMatches.filter((m) => m._passesFilter).slice(0, 30),
    [activeMatches],
  );

  const runArbeidsplassenIngest = async () => {
    setIngesting("arbeidsplassen");
    try {
      const { data, error } = await supabase.functions.invoke("ingest-arbeidsplassen-feed", {
        body: { maxPages: 8, sinceDays: 30 },
      });
      if (error) throw error;
      const d: any = data;
      toast({
        title: "Arbeidsplassen hentet",
        description: `${d.activeUpserted ?? 0} aktive oppdatert, ${d.inactiveUpdated ?? 0} inaktive markert.`,
      });
      await load();
    } catch (e: any) {
      toast({ title: "Ingest feilet", description: e.message, variant: "destructive" });
    } finally {
      setIngesting(null);
    }
  };

  const runFinnFallback = async () => {
    setIngesting("finn");
    try {
      const { data, error } = await supabase.functions.invoke("ingest-finn", {
        body: { includeUserFeeds: true, userId: user?.id },
      });
      if (error) throw error;
      const d: any = data;
      toast({
        title: d.ok ? "Finn fallback hentet" : "Finn trenger tilgang",
        description: d.hint ?? `${d.upserted ?? 0} Finn-jobber oppdatert fra RSS.`,
      });
      await load();
    } catch (e: any) {
      toast({ title: "Finn ingest feilet", description: e.message, variant: "destructive" });
    } finally {
      setIngesting(null);
    }
  };

  const runMatching = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("match-user-jobs", {
        body: { limit: 25, minVisibleScore: minScore },
      });
      if (error) throw error;
      const d: any = data;
      toast({
        title: "Matcher oppdatert",
        description: `${d.visible ?? 0} synlige av ${d.scored ?? 0} scorede jobber.`,
      });
      await load();
    } catch (e: any) {
      toast({ title: "Matching feilet", description: e.message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  const saveMatch = async (matchId: string) => {
    setSavingId(matchId);
    try {
      const { data, error } = await supabase.functions.invoke("match-user-jobs", {
        body: { action: "save-match", matchId },
      });
      if (error) throw error;
      const jobId = (data as any)?.jobId;
      toast({ title: "Lagt i jobber" });
      await load();
      if (jobId) navigate(`/jobs/${jobId}`);
    } catch (e: any) {
      toast({ title: "Kunne ikke lagre", description: e.message, variant: "destructive" });
    } finally {
      setSavingId(null);
    }
  };

  const dismissMatch = async (matchId: string) => {
    setSavingId(matchId);
    try {
      const { error } = await supabase.functions.invoke("match-user-jobs", {
        body: { action: "dismiss-match", matchId },
      });
      if (error) throw error;
      setMatches((items) => items.filter((m) => m.id !== matchId));
    } catch (e: any) {
      toast({ title: "Kunne ikke avvise", description: e.message, variant: "destructive" });
    } finally {
      setSavingId(null);
    }
  };

  const stateByProvider = useMemo(() => {
    const map = new Map<string, any>();
    states.forEach((s) => map.set(s.provider, s));
    return map;
  }, [states]);

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 lg:p-10 space-y-7">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Radar className="w-4 h-4" />
            Full matchmotor
          </div>
          <h1 className="text-2xl md:text-3xl font-semibold">Matcher</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Anbefalinger fra Finn/RSS og profilstyrte Arbeidsplassen-søk, scoret mot CV, profil, interesser og feedback.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={runArbeidsplassenIngest} disabled={ingesting !== null}>
            {ingesting === "arbeidsplassen" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Database className="w-4 h-4 mr-2" />}
            Oppdater bred NAV-cache
          </Button>
          <Button variant="outline" onClick={runFinnFallback} disabled={ingesting !== null}>
            {ingesting === "finn" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Finn fallback
          </Button>
          <Button onClick={runMatching} disabled={running}>
            {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
            Match profilen
          </Button>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {(["arbeidsplassen", "finn"] as Provider[]).map((provider) => {
          const state = stateByProvider.get(provider);
          return (
            <div key={provider} className="border border-border rounded-md bg-card p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium">{PROVIDER_LABEL[provider]}</div>
                <Badge variant={state?.last_status === "ok" || state?.last_status === "partial" ? "secondary" : "outline"}>
                  {state?.last_status ?? "ikke kjørt"}
                </Badge>
              </div>
              <div className="text-2xl font-semibold mt-3">{counts[provider] ?? 0}</div>
              <div className="text-xs text-muted-foreground mt-1">aktive annonser i cache</div>
              {state?.last_checked_at && (
                <div className="text-xs text-muted-foreground mt-3">
                  Sist sjekket {formatDistanceToNow(new Date(state.last_checked_at), { locale: nb, addSuffix: true })}
                </div>
              )}
              {state?.last_error && <div className="text-xs text-warning mt-2 line-clamp-2">{state.last_error}</div>}
            </div>
          );
        })}
        <div className="border border-border rounded-md bg-card p-4">
          <div className="font-medium">Dine matcher</div>
          <div className="text-2xl font-semibold mt-3">{matches.length}</div>
          <div className="text-xs text-muted-foreground mt-1">aktive anbefalinger etter feedback</div>
          <Link to="/profile" className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-3">
            Juster interesseprofil <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </section>

      <section className="border border-border rounded-md bg-card p-4 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="font-medium">Synlighetsfilter</div>
          <p className="text-xs text-muted-foreground mt-1">
            {topMatches.length} synlige av {activeMatches.length} aktive matcher. Inkluder-regler kan slippe gjennom treff under grensen.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-2">
            <Label className="text-xs">Min score</Label>
            <Input
              className="w-24"
              type="number"
              min={0}
              max={100}
              value={minScore}
              onChange={(e) => setMinScore(Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
            />
          </div>
          <Button variant="outline" onClick={() => setMinScore(profileMinScore)}>
            Standard {profileMinScore}
          </Button>
        </div>
      </section>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Laster matcher...
        </div>
      ) : topMatches.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center space-y-3">
            <Sparkles className="w-8 h-8 mx-auto text-muted-foreground" />
            <div className="font-medium">{activeMatches.length > 0 ? "Ingen matcher over filteret" : "Ingen matcher ennå"}</div>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              {activeMatches.length > 0
                ? "Senk min score, legg til en inkluder-regel, eller kjør matching på nytt etter at profilen er justert."
                : "Fyll ut interesseprofilen, la appen lage søkeforslag, og kjør deretter matching."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {topMatches.map((match) => (
            <MatchItem
              key={match.id}
              match={match}
              visibility={match._visibility}
              saving={savingId === match.id}
              onSave={() => saveMatch(match.id)}
              onDismiss={() => dismissMatch(match.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const MatchItem = ({
  match,
  visibility,
  saving,
  onSave,
  onDismiss,
}: {
  match: MatchRow;
  visibility: MatchVisibilityResult;
  saving: boolean;
  onSave: () => void;
  onDismiss: () => void;
}) => {
  const job = match.external_jobs;
  const reasoning = match.match_reasoning ?? {};
  const discovery = reasoning.discovery ?? job?.raw_data?.discovery ?? null;
  const provider = (job?.provider ?? "arbeidsplassen") as Provider;
  const strengths = Array.isArray(reasoning.strengths) ? reasoning.strengths : [];
  const concerns = Array.isArray(reasoning.concerns) ? reasoning.concerns : [];

  return (
    <div className="border border-border rounded-md bg-card hover:shadow-elevated transition-shadow">
      <div className="p-4 md:p-5 flex flex-col lg:flex-row gap-4">
        <div className="flex gap-4 flex-1 min-w-0">
          <ScoreBadge score={match.match_score} className="shrink-0 mt-0.5 text-sm px-2.5 py-1" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <Badge className={CATEGORY_TONE[provider]} variant="secondary">
                {PROVIDER_LABEL[provider]}
              </Badge>
              {match.status === "saved" && <Badge variant="secondary">Lagret</Badge>}
              {visibility.includeRuleName && (
                <Badge variant="outline">Sluppet gjennom av regel: {visibility.includeRuleName}</Badge>
              )}
              {discovery?.source === "profile_search" && (
                <Badge variant="outline">Funnet via: {[discovery.query, discovery.location].filter(Boolean).join(" ")}</Badge>
              )}
              {job?.deadline && <span className="text-xs text-muted-foreground">Frist {new Date(job.deadline).toLocaleDateString("nb-NO")}</span>}
            </div>
            <h2 className="font-semibold text-base md:text-lg leading-snug">{job?.title ?? "Ukjent stilling"}</h2>
            <div className="text-sm text-muted-foreground mt-0.5">
              {[job?.company, job?.location].filter(Boolean).join(" · ")}
            </div>
            {(reasoning.ai_summary || reasoning.summary) && (
              <p className="text-sm mt-3 max-w-3xl">{reasoning.ai_summary ?? reasoning.summary}</p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
              {strengths.length > 0 && (
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">Treffer</div>
                  {strengths.slice(0, 3).map((s: string, i: number) => (
                    <div key={i} className="text-xs flex gap-1.5">
                      <Check className="w-3 h-3 text-emerald-600 shrink-0 mt-0.5" />
                      <span>{s}</span>
                    </div>
                  ))}
                </div>
              )}
              {concerns.length > 0 && (
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">Vurder</div>
                  {concerns.slice(0, 3).map((s: string, i: number) => (
                    <div key={i} className="text-xs flex gap-1.5">
                      <AlertTriangle className="w-3 h-3 text-warning shrink-0 mt-0.5" />
                      <span>{s}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex lg:flex-col gap-2 lg:w-40 shrink-0">
          {match.job_id ? (
            <Button asChild className="flex-1 lg:flex-none">
              <Link to={`/jobs/${match.job_id}`}>Åpne jobb</Link>
            </Button>
          ) : (
            <Button onClick={onSave} disabled={saving} className="flex-1 lg:flex-none">
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Briefcase className="w-4 h-4 mr-2" />}
              Aktuell
            </Button>
          )}
          <Button variant="outline" onClick={onDismiss} disabled={saving} className="flex-1 lg:flex-none">
            <X className="w-4 h-4 mr-2" />
            Ikke relevant
          </Button>
          {job?.source_url && (
            <Button variant="ghost" asChild className="flex-1 lg:flex-none">
              <a href={job.source_url} target="_blank" rel="noreferrer">
                <ExternalLink className="w-4 h-4 mr-2" />
                Kilde
              </a>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Matches;
