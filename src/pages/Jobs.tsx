import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { ScoreBadge } from "@/components/ScoreBadge";
import { useToast } from "@/hooks/use-toast";
import { evaluateMatchVisibility, type MatchVisibilityRule } from "@/lib/matchVisibility";
import { JOB_STATUS_STRIPE } from "@/lib/statusStyles";
import { discoveryToastDescription, matchStatusForJobStatus, statusToFeedbackDecision } from "@/lib/jobDiscovery";
import { Plus, Loader2, Sparkles, ExternalLink, Filter, Bookmark, Trash2, X, Send, ChevronDown, Layers, ArrowUpDown, Archive, ArchiveRestore, RefreshCw } from "lucide-react";
import { format } from "date-fns";

type Job = any;
type SavedFilter = { id: string; name: string; config: FilterConfig };
type FilterConfig = {
  status?: string[]; sources?: string[]; minScore?: number; maxScore?: number;
  hasRisks?: boolean | null; deadlineDays?: number | null; search?: string;
};

type MatchRun = {
  id: string;
  status: string;
  provider: string | null;
  total_estimate: number;
  scanned_count: number;
  candidate_count: number;
  scored_count: number;
  visible_count: number;
  jobs_created_count: number;
  last_error: string | null;
  completed_at: string | null;
  created_at: string;
};

const STATUSES = [
  { v: "discovered", label: "Oppdaget" }, { v: "considering", label: "Vurderer" },
  { v: "applied", label: "Søkt" }, { v: "interview", label: "Intervju" },
  { v: "offer", label: "Tilbud" }, { v: "rejected", label: "Avslag" }, { v: "archived", label: "Arkivert" },
];
const SOURCES = [
  { v: "manual", label: "Manuell" }, { v: "url", label: "URL" },
  { v: "rss", label: "RSS" }, { v: "auto_search", label: "Auto-søk" },
  { v: "arbeidsplassen", label: "Arbeidsplassen" }, { v: "finn", label: "Finn" },
  { v: "linkedin", label: "LinkedIn" }, { v: "file", label: "Fil" },
];

const INTEREST_META: Record<string, { label: string; cls: string }> = {
  uninterested: { label: "Uinteressant", cls: "bg-muted text-muted-foreground" },
  interested: { label: "Aktuell", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  very_interested: { label: "Veldig interessert", cls: "bg-primary/15 text-primary" },
};

type SortKey = "created_desc" | "created_asc" | "score_desc" | "score_asc" | "deadline_asc" | "status" | "title_asc";

const SORT_OPTIONS: { v: SortKey; label: string }[] = [
  { v: "created_desc", label: "Nyeste først" },
  { v: "created_asc", label: "Eldste først" },
  { v: "score_desc", label: "Høyest score" },
  { v: "score_asc", label: "Lavest score" },
  { v: "deadline_asc", label: "Nærmeste frist" },
  { v: "status", label: "Status" },
  { v: "title_asc", label: "Tittel A–Å" },
];

const STATUS_ORDER: Record<string, number> = {
  discovered: 0, considering: 1, applied: 2, interview: 3, offer: 4, rejected: 5, archived: 6,
};

const Jobs = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [filters, setFilters] = useState<SavedFilter[]>([]);
  const [visibilityRules, setVisibilityRules] = useState<MatchVisibilityRule[]>([]);
  const [profileMinScore, setProfileMinScore] = useState(65);
  const [loading, setLoading] = useState(true);
  const [matchRun, setMatchRun] = useState<MatchRun | null>(null);
  const [config, setConfig] = useState<FilterConfig>({});
  const [showFilters, setShowFilters] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("created_desc");
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [j, f, p, r, mr] = await Promise.all([
      supabase.from("jobs").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("saved_filters").select("*").eq("user_id", user.id).order("sort_order"),
      supabase.from("profiles").select("match_min_visible_score").eq("user_id", user.id).maybeSingle(),
      supabase
        .from("match_visibility_rules")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true),
      (supabase as any)
        .from("user_match_runs")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    setJobs(j.data ?? []);
    setFilters((f.data ?? []) as any);
    setVisibilityRules((r.data ?? []) as any);
    setMatchRun((mr.data ?? null) as MatchRun | null);
    const nextMinScore = (p.data as any)?.match_min_visible_score ?? 65;
    setProfileMinScore(nextMinScore);
    setConfig((current) => (Object.keys(current).length === 0 ? { minScore: nextMinScore } : current));
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const list = jobs.filter((j) => {
      // Hide archived by default unless user toggled or explicitly filters on it
      if (!showArchived && j.status === "archived" && !config.status?.includes("archived")) return false;
      if (config.status?.length && !config.status.includes(j.status)) return false;
      if (config.sources?.length && !config.sources.includes(j.source)) return false;
      const visibility = evaluateMatchVisibility(
        {
          title: j.title,
          company: j.company,
          location: j.location,
          description: j.description,
          source: j.source,
        },
        j.match_score,
        config.minScore ?? profileMinScore,
        visibilityRules,
      );
      if (["discovered", "considering"].includes(j.status) && visibility.excludeRuleName) return false;
      if (config.minScore != null && (j.match_score ?? 0) < config.minScore && !visibility.includeRuleName) return false;
      if (config.maxScore != null && (j.match_score ?? 100) > config.maxScore) return false;
      if (config.hasRisks === true && !(j.risk_flags?.length > 0)) return false;
      if (config.hasRisks === false && j.risk_flags?.length > 0) return false;
      if (config.deadlineDays != null && j.deadline) {
        const days = (new Date(j.deadline).getTime() - Date.now()) / 86400000;
        if (days > config.deadlineDays || days < 0) return false;
      }
      if (config.search) {
        const q = config.search.toLowerCase();
        if (!`${j.title} ${j.company ?? ""}`.toLowerCase().includes(q)) return false;
      }
      return true;
    });

    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (sortBy) {
        case "created_asc":
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case "score_desc":
          return (b.match_score ?? -1) - (a.match_score ?? -1);
        case "score_asc":
          return (a.match_score ?? 101) - (b.match_score ?? 101);
        case "deadline_asc": {
          const da = a.deadline ? new Date(a.deadline).getTime() : Infinity;
          const db = b.deadline ? new Date(b.deadline).getTime() : Infinity;
          return da - db;
        }
        case "status":
          return (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99);
        case "title_asc":
          return (a.title ?? "").localeCompare(b.title ?? "", "no");
        case "created_desc":
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });
    return sorted;
  }, [jobs, config, sortBy, showArchived, profileMinScore, visibilityRules]);

  const archivedCount = useMemo(() => jobs.filter((j) => j.status === "archived").length, [jobs]);
  const unscoredCount = useMemo(
    () => jobs.filter((j) => j.match_score == null && j.source_url && ["auto_search", "rss", "url", "linkedin"].includes(j.source)).length,
    [jobs]
  );
  const [enriching, setEnriching] = useState(false);

  const enrichMissing = async () => {
    setEnriching(true);
    try {
      const { data, error } = await supabase.functions.invoke("enrich-jobs", { body: {} });
      if (error) throw error;
      const d: any = data;
      toast({
        title: "Berikelse fullført",
        description: `${d.enriched ?? 0} jobber oppdatert${d.skipped ? `, ${d.skipped} hoppet over` : ""}${d.remaining ? `. ${d.remaining} gjenstår.` : "."}`,
      });
      load();
    } catch (e: any) {
      toast({ title: "Feilet", description: e.message, variant: "destructive" });
    } finally {
      setEnriching(false);
    }
  };

  const discoverJobs = async () => {
    if (!user) return;
    setDiscovering(true);
    const warnings: string[] = [];
    try {
      const suggestions = await supabase.functions.invoke("suggest-source-feeds", { body: {} });
      if (suggestions.error) warnings.push(`Kildeforslag: ${suggestions.error.message}`);

      const arbeidsplassen = await supabase.functions.invoke("ingest-arbeidsplassen-feed", {
        body: { maxPages: 3, maxItems: 180 },
      });
      if (arbeidsplassen.error) warnings.push(`Arbeidsplassen: ${arbeidsplassen.error.message}`);

      const finn = await supabase.functions.invoke("ingest-finn", {
        body: {
          includeUserFeeds: true,
          includeOfficialApi: false,
          includeHtmlSuggestions: false,
          userId: user.id,
          maxSuggestionsPerUser: 3,
          maxHitsPerSuggestion: 10,
        },
      });
      if (finn.error) warnings.push(`Finn: ${finn.error.message}`);
      const finnHint = (finn.data as any)?.hint;
      if (finnHint) warnings.push(String(finnHint));

      const { data, error } = await supabase.functions.invoke("match-user-jobs", {
        body: {
          mode: "hybrid",
          initialLimit: 20,
          enqueueFullScan: true,
          minVisibleScore: config.minScore ?? profileMinScore,
          includeBroadCache: true,
          autoSaveVisible: true,
          materializeExisting: true,
        },
      });
      if (error) throw error;

      const d = data as any;
      toast({
        title: "Jobber oppdatert",
        description: warnings.length > 0
          ? `${discoveryToastDescription(d)} ${warnings[0].slice(0, 160)}`
          : discoveryToastDescription(d),
      });
      await load();
    } catch (e: any) {
      toast({ title: "Fant ikke nye jobber", description: e.message, variant: "destructive" });
    } finally {
      setDiscovering(false);
    }
  };

  const addJob = async () => {
    if (!url && !text.trim()) { toast({ title: "Lim inn URL eller tekst", variant: "destructive" }); return; }
    setAdding(true);
    try {
      const { data, error } = await supabase.functions.invoke("parse-job", { body: { url: url || null, text: text || null } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast({ title: "Jobb lagt til" });
      setDialogOpen(false); setUrl(""); setText(""); load();
    } catch (e: any) { toast({ title: "Feilet", description: e.message, variant: "destructive" }); }
    finally { setAdding(false); }
  };

  const updateStatus = async (id: string, status: string) => {
    const job = jobs.find((item) => item.id === id);
    const previousStatus = job?.status ?? null;
    const { error } = await supabase.from("jobs").update({ status: status as any }).eq("id", id);
    if (error) {
      toast({ title: "Kunne ikke oppdatere status", description: error.message, variant: "destructive" });
      return;
    }

    const decision = statusToFeedbackDecision(status, previousStatus);
    if (user && decision) {
      let match: any = null;
      if (job?.external_job_id) {
        const { data: matchData } = await supabase
          .from("user_job_matches")
          .select("id,match_score")
          .eq("user_id", user.id)
          .eq("external_job_id", job.external_job_id)
          .maybeSingle();
        match = matchData;

        const nextMatchStatus = matchStatusForJobStatus(status);
        if (match?.id && nextMatchStatus) {
          await supabase.from("user_job_matches").update({ status: nextMatchStatus as any }).eq("id", match.id);
        }
      }

      await supabase.from("job_score_feedback").insert({
        user_id: user.id,
        job_id: id,
        external_job_id: job?.external_job_id ?? null,
        user_job_match_id: match?.id ?? null,
        decision: decision as any,
        original_score: job?.match_score ?? match?.match_score ?? null,
        metadata: { source: "jobs_status", previousStatus, nextStatus: status },
      });
    }

    load();
  };

  const saveFilter = async () => {
    if (!user || !saveName.trim()) return;
    await supabase.from("saved_filters").insert({ user_id: user.id, name: saveName.trim(), config: config as any });
    setSaveName(""); load();
  };

  const deleteFilter = async (id: string) => { await supabase.from("saved_filters").delete().eq("id", id); load(); };

  const activeFilterCount = Object.values(config).filter((v) => v !== undefined && v !== null && v !== "" && (Array.isArray(v) ? v.length > 0 : true)).length;

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 lg:p-10 space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center shadow-elevated shrink-0">
            <Layers className="w-5 h-5 text-primary-foreground" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Jobber</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {filtered.length} av {jobs.length} jobber
              {!showArchived && archivedCount > 0 && ` · ${archivedCount} arkivert skjult`}
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={discoverJobs} disabled={discovering}>
            {discovering ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
            Finn nye jobber
          </Button>
          <Button variant="outline" asChild>
            <Link to="/jobs/swipe"><Layers className="w-4 h-4 mr-2" /> Sveip-modus</Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <ArrowUpDown className="w-4 h-4 mr-2" />
                {SORT_OPTIONS.find((s) => s.v === sortBy)?.label}
                <ChevronDown className="w-3 h-3 ml-1.5 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="text-xs">Sorter etter</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {SORT_OPTIONS.map((s) => (
                <DropdownMenuItem
                  key={s.v}
                  onClick={() => setSortBy(s.v)}
                  className={sortBy === s.v ? "bg-accent" : ""}
                >
                  {s.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {archivedCount > 0 && (
            <Button
              variant={showArchived ? "secondary" : "outline"}
              onClick={() => setShowArchived((v) => !v)}
            >
              {showArchived ? (
                <><Archive className="w-4 h-4 mr-2" /> Skjul arkiverte</>
              ) : (
                <><ArchiveRestore className="w-4 h-4 mr-2" /> Vis arkiverte ({archivedCount})</>
              )}
            </Button>
          )}
          {unscoredCount > 0 && (
            <Button variant="outline" onClick={enrichMissing} disabled={enriching}>
              {enriching ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Hent manglende info ({unscoredCount})
            </Button>
          )}
          <Button variant="outline" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="w-4 h-4 mr-2" /> Filter {activeFilterCount > 0 && <span className="ml-1.5 px-1.5 py-0 rounded bg-primary text-primary-foreground text-xs">{activeFilterCount}</span>}
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild><Button variant="outline"><Plus className="w-4 h-4 mr-2" /> Legg til</Button></DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>Ny jobb</DialogTitle></DialogHeader>
              <Tabs defaultValue="url">
                <TabsList className="grid grid-cols-2 w-full">
                  <TabsTrigger value="url">Fra URL</TabsTrigger>
                  <TabsTrigger value="text">Lim inn tekst</TabsTrigger>
                </TabsList>
                <TabsContent value="url" className="space-y-2 mt-4">
                  <Label>Stillings-URL</Label>
                  <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.finn.no/job/..." />
                </TabsContent>
                <TabsContent value="text" className="space-y-2 mt-4">
                  <Label>Stillingstekst</Label>
                  <Textarea rows={12} value={text} onChange={(e) => setText(e.target.value)} />
                </TabsContent>
              </Tabs>
              <DialogFooter>
                <Button onClick={addJob} disabled={adding}>
                  {adding ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Leser stillingen…</> : <><Sparkles className="w-4 h-4 mr-2" /> Legg til</>}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      {matchRun && (
        <section className="rounded-md border border-border bg-card p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">
              Fullscan {matchRun.status === "completed" ? "ferdig" : matchRun.status === "failed" ? "feilet" : "pågår"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {matchRun.scanned_count}/{Math.max(matchRun.total_estimate, matchRun.scanned_count)} aktive jobber vurdert · {matchRun.candidate_count} kandidater · {matchRun.visible_count} synlige
            </p>
            {matchRun.last_error && <p className="text-xs text-destructive mt-1">{matchRun.last_error}</p>}
          </div>
          <div className="w-full md:w-64">
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{
                  width: `${matchRun.total_estimate > 0 ? Math.min(100, Math.round((matchRun.scanned_count / matchRun.total_estimate) * 100)) : matchRun.status === "completed" ? 100 : 0}%`,
                }}
              />
            </div>
          </div>
        </section>
      )}

      {/* Saved filters chips */}
      {filters.length > 0 && (
        <div className="flex flex-wrap gap-1.5 items-center">
          <Bookmark className="w-3.5 h-3.5 text-muted-foreground" />
          {filters.map((f) => (
            <button key={f.id} onClick={() => setConfig(f.config)}
              className="group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-accent text-accent-foreground text-xs hover:shadow-card">
              {f.name}
              <X className="w-3 h-3 opacity-0 group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); deleteFilter(f.id); }} />
            </button>
          ))}
        </div>
      )}

      {/* Filter panel */}
      {showFilters && (
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label className="text-xs">Søk</Label>
                <Input value={config.search ?? ""} onChange={(e) => setConfig({ ...config, search: e.target.value })} placeholder="Tittel/selskap…" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Min score</Label>
                <Input type="number" min={0} max={100} value={config.minScore ?? ""} onChange={(e) => setConfig({ ...config, minScore: e.target.value ? +e.target.value : undefined })} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Maks score</Label>
                <Input type="number" min={0} max={100} value={config.maxScore ?? ""} onChange={(e) => setConfig({ ...config, maxScore: e.target.value ? +e.target.value : undefined })} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Frist innen (dager)</Label>
                <Input type="number" min={0} value={config.deadlineDays ?? ""} onChange={(e) => setConfig({ ...config, deadlineDays: e.target.value ? +e.target.value : null })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Status</Label>
              <div className="flex flex-wrap gap-1.5">
                {STATUSES.map((s) => {
                  const on = config.status?.includes(s.v);
                  return (
                    <button key={s.v} onClick={() => setConfig({ ...config, status: on ? config.status?.filter((x) => x !== s.v) : [...(config.status ?? []), s.v] })}
                      className={`px-2 py-1 rounded text-xs ${on ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{s.label}</button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Kilde</Label>
              <div className="flex flex-wrap gap-1.5">
                {SOURCES.map((s) => {
                  const on = config.sources?.includes(s.v);
                  return (
                    <button key={s.v} onClick={() => setConfig({ ...config, sources: on ? config.sources?.filter((x) => x !== s.v) : [...(config.sources ?? []), s.v] })}
                      className={`px-2 py-1 rounded text-xs ${on ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{s.label}</button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Risk flags</Label>
              <div className="flex gap-1.5">
                {[{ v: null, l: "Alle" }, { v: true, l: "Med flags" }, { v: false, l: "Uten flags" }].map((o) => (
                  <button key={String(o.v)} onClick={() => setConfig({ ...config, hasRisks: o.v as any })}
                    className={`px-2 py-1 rounded text-xs ${config.hasRisks === o.v ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{o.l}</button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 pt-2 border-t border-border">
              <Input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="Navn på filter…" className="max-w-xs" />
              <Button variant="outline" size="sm" onClick={saveFilter} disabled={!saveName.trim()}>
                <Bookmark className="w-4 h-4 mr-1" /> Lagre filter
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfig({ minScore: profileMinScore })}>Nullstill</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Laster…</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center space-y-2">
            <div className="font-medium">Ingen jobber over filteret</div>
            <p className="text-sm text-muted-foreground">Finn nye jobber, senk min score, vis arkiverte, eller nullstill filteret.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((j) => (
            <JobListItem
              key={j.id}
              job={j}
              minScore={config.minScore ?? profileMinScore}
              visibilityRules={visibilityRules}
              updateStatus={updateStatus}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const JobListItem = ({
  job: j,
  minScore,
  visibilityRules,
  updateStatus,
}: {
  job: Job;
  minScore: number;
  visibilityRules: MatchVisibilityRule[];
  updateStatus: (id: string, status: string) => void;
}) => {
  const visibility = evaluateMatchVisibility(
    {
      title: j.title,
      company: j.company,
      location: j.location,
      description: j.description,
      source: j.source,
    },
    j.match_score,
    minScore,
    visibilityRules,
  );
  const reasoning = j.match_reasoning ?? {};
  const strengths = Array.isArray(reasoning.strengths) ? reasoning.strengths : [];
  const concerns = Array.isArray(reasoning.concerns) ? reasoning.concerns : [];

  return (
    <Link to={`/jobs/${j.id}`} className="block">
              <Card className={`hover:shadow-elevated transition-shadow border-l-2 ${JOB_STATUS_STRIPE[j.status] ?? "border-l-muted-foreground/30"}`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <ScoreBadge score={j.match_score} className="mt-0.5 text-sm px-2.5 py-1" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <h3 className="font-semibold">{j.title}</h3>
                        {j.company && <span className="text-sm text-muted-foreground">· {j.company}</span>}
                        {j.location && <span className="text-xs text-muted-foreground">· {j.location}</span>}
                      </div>
                      {j.ai_summary && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{j.ai_summary}</p>}
                      {(strengths.length > 0 || concerns.length > 0) && (
                        <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                          {strengths[0] && (
                            <div className="rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 px-2 py-1 line-clamp-2">
                              Treffer: {strengths[0]}
                            </div>
                          )}
                          {concerns[0] && (
                            <div className="rounded-md bg-warning/10 text-warning px-2 py-1 line-clamp-2">
                              Sjekk: {concerns[0]}
                            </div>
                          )}
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground flex-wrap">
                        <span className="px-1.5 py-0.5 bg-muted rounded">{STATUSES.find((s) => s.v === j.status)?.label}</span>
                        {visibility.includeRuleName && (
                          <span className="px-1.5 py-0.5 bg-primary/10 text-primary rounded">
                            Regel: {visibility.includeRuleName}
                          </span>
                        )}
                        {j.interest_level && j.interest_level !== "none" && INTEREST_META[j.interest_level] && (
                          <span className={`px-1.5 py-0.5 rounded ${INTEREST_META[j.interest_level].cls}`}>
                            {INTEREST_META[j.interest_level].label}
                          </span>
                        )}
                        <span className="px-1.5 py-0.5 bg-accent text-accent-foreground rounded">{SOURCES.find((s) => s.v === j.source)?.label}</span>
                        {j.deadline && <span>Frist {format(new Date(j.deadline), "dd.MM")}</span>}
                        {j.risk_flags?.length > 0 && <span className="text-warning">⚠ {j.risk_flags.length}</span>}
                        {j.auto_draft_at && <span className="text-primary">✨ Auto-utkast</span>}
                        {j.source_url && (
                          <a href={j.source_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 hover:text-foreground">
                            <ExternalLink className="w-3 h-3" /> Kilde
                          </a>
                        )}
                      </div>
                    </div>
                    <div
                      className="flex items-center gap-1 shrink-0"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    >
                      {j.status !== "applied" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs"
                          onClick={() => updateStatus(j.id, "applied")}
                        >
                          <Send className="w-3.5 h-3.5 mr-1" /> Søkt
                        </Button>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="ghost" className="h-8 text-xs px-2">
                            {STATUSES.find((s) => s.v === j.status)?.label}
                            <ChevronDown className="w-3 h-3 ml-1" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuLabel className="text-xs">Endre status</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {STATUSES.map((s) => (
                            <DropdownMenuItem
                              key={s.v}
                              onClick={() => updateStatus(j.id, s.v)}
                              className={j.status === s.v ? "bg-accent" : ""}
                            >
                              {s.label}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
  );
};

export default Jobs;
