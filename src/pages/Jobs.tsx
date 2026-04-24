import { useEffect, useMemo, useState } from "react";
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
import { Plus, Loader2, Sparkles, ExternalLink, Filter, Bookmark, Trash2, X, Send, ChevronDown, Layers } from "lucide-react";
import { format } from "date-fns";

type Job = any;
type SavedFilter = { id: string; name: string; config: FilterConfig };
type FilterConfig = {
  status?: string[]; sources?: string[]; minScore?: number; maxScore?: number;
  hasRisks?: boolean | null; deadlineDays?: number | null; search?: string;
};

const STATUSES = [
  { v: "discovered", label: "Oppdaget" }, { v: "considering", label: "Vurderer" },
  { v: "applied", label: "Søkt" }, { v: "interview", label: "Intervju" },
  { v: "offer", label: "Tilbud" }, { v: "rejected", label: "Avslag" }, { v: "archived", label: "Arkivert" },
];
const SOURCES = [
  { v: "manual", label: "Manuell" }, { v: "url", label: "URL" },
  { v: "rss", label: "RSS" }, { v: "linkedin", label: "LinkedIn" }, { v: "file", label: "Fil" },
];

const INTEREST_META: Record<string, { label: string; cls: string }> = {
  uninterested: { label: "Uinteressant", cls: "bg-muted text-muted-foreground" },
  interested: { label: "Aktuell", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  very_interested: { label: "Veldig interessert", cls: "bg-primary/15 text-primary" },
};

const Jobs = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [filters, setFilters] = useState<SavedFilter[]>([]);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<FilterConfig>({});
  const [showFilters, setShowFilters] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");

  useEffect(() => { load(); }, [user]);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const [j, f] = await Promise.all([
      supabase.from("jobs").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("saved_filters").select("*").eq("user_id", user.id).order("sort_order"),
    ]);
    setJobs(j.data ?? []);
    setFilters((f.data ?? []) as any);
    setLoading(false);
  };

  const filtered = useMemo(() => {
    return jobs.filter((j) => {
      if (config.status?.length && !config.status.includes(j.status)) return false;
      if (config.sources?.length && !config.sources.includes(j.source)) return false;
      if (config.minScore != null && (j.match_score ?? 0) < config.minScore) return false;
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
  }, [jobs, config]);

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
    await supabase.from("jobs").update({ status: status as any }).eq("id", id); load();
  };

  const saveFilter = async () => {
    if (!user || !saveName.trim()) return;
    await supabase.from("saved_filters").insert({ user_id: user.id, name: saveName.trim(), config: config as any });
    setSaveName(""); load();
  };

  const deleteFilter = async (id: string) => { await supabase.from("saved_filters").delete().eq("id", id); load(); };

  const activeFilterCount = Object.values(config).filter((v) => v !== undefined && v !== null && v !== "" && (Array.isArray(v) ? v.length > 0 : true)).length;

  return (
    <div className="max-w-6xl mx-auto p-6 lg:p-10 space-y-6">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold">Jobber</h1>
          <p className="text-muted-foreground text-sm mt-1">{filtered.length} av {jobs.length} jobber</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" asChild>
            <Link to="/jobs/swipe"><Layers className="w-4 h-4 mr-2" /> Sveip-modus</Link>
          </Button>
          <Button variant="outline" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="w-4 h-4 mr-2" /> Filter {activeFilterCount > 0 && <span className="ml-1.5 px-1.5 py-0 rounded bg-primary text-primary-foreground text-xs">{activeFilterCount}</span>}
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" /> Legg til</Button></DialogTrigger>
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
                  {adding ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> AI parser…</> : <><Sparkles className="w-4 h-4 mr-2" /> Legg til</>}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </header>

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
              <Button variant="ghost" size="sm" onClick={() => setConfig({})}>Nullstill</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Laster…</div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">Ingen jobber matcher.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((j) => (
            <Link key={j.id} to={`/jobs/${j.id}`} className="block">
              <Card className="hover:shadow-elevated transition-shadow">
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
                      <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground flex-wrap">
                        <span className="px-1.5 py-0.5 bg-muted rounded">{STATUSES.find((s) => s.v === j.status)?.label}</span>
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
          ))}
        </div>
      )}
    </div>
  );
};

export default Jobs;
