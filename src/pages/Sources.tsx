import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  buildSourceSearchText,
  buildSourceSearchUrl,
  SOURCE_PROVIDER_LABEL,
  type SourceSuggestionProvider,
} from "@/lib/sourceSuggestions";
import {
  Loader2,
  Plus,
  Trash2,
  RefreshCw,
  Rss,
  Search,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  Sparkles,
  Database,
  ExternalLink,
  Copy,
  Wand2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { nb } from "date-fns/locale";

type Feed = {
  id: string;
  name: string;
  url: string;
  is_active: boolean;
  last_checked_at: string | null;
  items_found: number;
  last_error: string | null;
};

type Source = "finn" | "arbeidsplassen" | "linkedin";
type Status = "ok" | "blocked" | "error" | "pending";

type AutoSearch = {
  id: string;
  name: string;
  source: Source;
  query: string;
  location: string | null;
  is_active: boolean;
  last_checked_at: string | null;
  last_status: Status;
  last_error: string | null;
  blocked_hint: string | null;
  items_found: number;
};

type SourceSuggestion = {
  id: string;
  provider: SourceSuggestionProvider;
  name: string;
  query: string;
  location: string | null;
  search_url: string;
  rss_url: string | null;
  reason: string | null;
  confidence: number;
  status: "suggested" | "active" | "paused" | "dismissed";
  is_active: boolean;
};

const SOURCE_LABEL: Record<Source, string> = {
  finn: "Finn.no",
  arbeidsplassen: "Arbeidsplassen (NAV)",
  linkedin: "LinkedIn",
};

const Sources = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  // Auto-søk state
  const [autoItems, setAutoItems] = useState<AutoSearch[]>([]);
  const [autoLoading, setAutoLoading] = useState(true);
  const [autoAdding, setAutoAdding] = useState(false);
  const [autoRunning, setAutoRunning] = useState<string | null>(null);
  const [autoName, setAutoName] = useState("");
  const [autoSource, setAutoSource] = useState<Source>("arbeidsplassen");
  const [autoQuery, setAutoQuery] = useState("");
  const [autoLocation, setAutoLocation] = useState("");
  const [sourceStates, setSourceStates] = useState<any[]>([]);
  const [externalCounts, setExternalCounts] = useState<Record<string, number>>({});
  const [fullRunning, setFullRunning] = useState<string | null>(null);
  const [sourceSuggestions, setSourceSuggestions] = useState<SourceSuggestion[]>([]);
  const [suggestionsEnabled, setSuggestionsEnabled] = useState(true);
  const [suggestionsLoading, setSuggestionsLoading] = useState(true);
  const [suggestionsRunning, setSuggestionsRunning] = useState(false);

  // RSS state
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [rssLoading, setRssLoading] = useState(true);
  const [rssAdding, setRssAdding] = useState(false);
  const [rssPolling, setRssPolling] = useState<string | null>(null);
  const [rssName, setRssName] = useState("");
  const [rssUrl, setRssUrl] = useState("");

  const loadSuggestions = useCallback(async (generateIfEmpty = false) => {
    if (!user) return;
    setSuggestionsLoading(true);
    const [{ data: prof }, { data: suggestions }] = await Promise.all([
      supabase.from("profiles").select("auto_source_suggestions_enabled").eq("user_id", user.id).maybeSingle(),
      supabase
        .from("source_suggestions")
        .select("*")
        .eq("user_id", user.id)
        .neq("status", "dismissed" as any)
        .order("confidence", { ascending: false }),
    ]);
    const enabled = prof?.auto_source_suggestions_enabled ?? true;
    setSuggestionsEnabled(enabled);
    if (generateIfEmpty && enabled && (suggestions?.length ?? 0) === 0) {
      const { error } = await supabase.functions.invoke("suggest-source-feeds", { body: {} });
      if (!error) {
        const { data: refreshed } = await supabase
          .from("source_suggestions")
          .select("*")
          .eq("user_id", user.id)
          .neq("status", "dismissed" as any)
          .order("confidence", { ascending: false });
        setSourceSuggestions((refreshed ?? []) as SourceSuggestion[]);
        setSuggestionsLoading(false);
        return;
      }
    }
    setSourceSuggestions((suggestions ?? []) as SourceSuggestion[]);
    setSuggestionsLoading(false);
  }, [user]);

  const setAutoSuggestionsEnabled = async (enabled: boolean) => {
    if (!user) return;
    setSuggestionsEnabled(enabled);
    const { error } = await supabase
      .from("profiles")
      .update({ auto_source_suggestions_enabled: enabled } as any)
      .eq("user_id", user.id);
    if (error) toast({ title: "Kunne ikke lagre", description: error.message, variant: "destructive" });
    if (enabled && sourceSuggestions.length === 0) generateSuggestions(false);
  };

  const generateSuggestions = async (force = true) => {
    setSuggestionsRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("suggest-source-feeds", { body: { force } });
      if (error) throw error;
      const d: any = data;
      toast({
        title: "Kildeforslag oppdatert",
        description: `${d.generated ?? 0} søkeforslag er klare.`,
      });
      loadSuggestions(false);
    } catch (e: any) {
      toast({ title: "Kunne ikke lage forslag", description: e.message, variant: "destructive" });
    } finally {
      setSuggestionsRunning(false);
    }
  };

  const updateSuggestion = async (id: string, patch: Partial<SourceSuggestion>) => {
    const next = sourceSuggestions.find((item) => item.id === id);
    const query = patch.query ?? next?.query ?? "";
    const location = patch.location ?? next?.location ?? null;
    const provider = patch.provider ?? next?.provider ?? "finn";
    const searchUrl = buildSourceSearchUrl(provider, query, location);
    setSourceSuggestions((items) => items.map((item) => (item.id === id ? { ...item, ...patch, search_url: searchUrl } : item)));
    const { error } = await supabase
      .from("source_suggestions")
      .update({ ...patch, search_url: searchUrl } as any)
      .eq("id", id);
    if (error) toast({ title: "Kunne ikke oppdatere forslag", description: error.message, variant: "destructive" });
  };

  const dismissSuggestion = async (id: string) => {
    await supabase.from("source_suggestions").update({ status: "dismissed" as any, is_active: false }).eq("id", id);
    setSourceSuggestions((items) => items.filter((item) => item.id !== id));
  };

  const connectSuggestionRss = async (suggestion: SourceSuggestion) => {
    if (suggestion.provider !== "finn") {
      toast({ title: "RSS gjelder bare Finn-forslag", variant: "destructive" });
      return;
    }
    if (!user || !suggestion.rss_url?.trim()) {
      toast({ title: "Lim inn RSS-lenke først", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("rss_feeds").insert({
      user_id: user.id,
      name: suggestion.name,
      url: suggestion.rss_url.trim(),
    });
    if (error) {
      toast({ title: "Kunne ikke koble RSS", description: error.message, variant: "destructive" });
      return;
    }
    await supabase.from("source_suggestions").update({ status: "active" as any, is_active: true }).eq("id", suggestion.id);
    toast({ title: "RSS koblet" });
    loadSuggestions(false);
    loadRss();
  };

  const copySuggestionSearch = async (suggestion: SourceSuggestion) => {
    const text = buildSourceSearchText(suggestion.query, suggestion.location);
    await navigator.clipboard.writeText(text);
    toast({ title: "Søketekst kopiert", description: text });
  };

  const loadCoverage = useCallback(async () => {
    const [states, arbeidsplassenCount, finnCount] = await Promise.all([
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
    ]);
    setSourceStates(states.data ?? []);
    setExternalCounts({
      arbeidsplassen: arbeidsplassenCount.count ?? 0,
      finn: finnCount.count ?? 0,
    });
  }, []);

  const runFullSource = async (source: "arbeidsplassen" | "finn") => {
    setFullRunning(source);
    try {
      const { data, error } = source === "arbeidsplassen"
        ? await supabase.functions.invoke("ingest-arbeidsplassen-feed", { body: { maxPages: 8, sinceDays: 30 } })
        : await supabase.functions.invoke("ingest-finn", { body: { includeUserFeeds: true, userId: user?.id } });
      if (error) throw error;
      const d: any = data;
      toast({
        title: source === "arbeidsplassen" ? "Arbeidsplassen oppdatert" : "Finn sjekket",
        description: d.hint ?? `${d.activeUpserted ?? d.upserted ?? 0} annonser oppdatert.`,
      });
      loadCoverage();
    } catch (e: any) {
      toast({ title: "Feilet", description: e.message, variant: "destructive" });
    } finally {
      setFullRunning(null);
    }
  };

  // ============= Auto-søk =============
  const loadAuto = useCallback(async () => {
    if (!user) return;
    setAutoLoading(true);
    const { data } = await supabase
      .from("auto_searches")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setAutoItems((data ?? []) as AutoSearch[]);
    setAutoLoading(false);
  }, [user]);

  const addAuto = async () => {
    if (!user || !autoName.trim() || !autoQuery.trim()) {
      toast({ title: "Navn og søkeord kreves", variant: "destructive" });
      return;
    }
    setAutoAdding(true);
    const { error } = await supabase.from("auto_searches").insert({
      user_id: user.id,
      name: autoName.trim(),
      source: autoSource,
      query: autoQuery.trim(),
      location: autoLocation.trim() || null,
    });
    setAutoAdding(false);
    if (error) toast({ title: "Feilet", description: error.message, variant: "destructive" });
    else {
      setAutoName("");
      setAutoQuery("");
      setAutoLocation("");
      loadAuto();
    }
  };

  const toggleAuto = async (s: AutoSearch) => {
    await supabase.from("auto_searches").update({ is_active: !s.is_active }).eq("id", s.id);
    loadAuto();
  };

  const removeAuto = async (id: string) => {
    if (!confirm("Slett auto-søket?")) return;
    await supabase.from("auto_searches").delete().eq("id", id);
    loadAuto();
  };

  const runAuto = async (searchId?: string) => {
    setAutoRunning(searchId ?? "all");
    try {
      const { data, error } = await supabase.functions.invoke("auto-search", {
        body: searchId ? { searchId } : {},
      });
      if (error) throw error;
      const d: any = data;
      toast({
        title: "Søk kjørt",
        description: `${d.searches ?? 0} søk, ${d.newJobs ?? 0} nye jobber funnet.`,
      });
      loadAuto();
    } catch (e: any) {
      toast({ title: "Feilet", description: e.message, variant: "destructive" });
    } finally {
      setAutoRunning(null);
    }
  };

  // ============= RSS =============
  const loadRss = useCallback(async () => {
    if (!user) return;
    setRssLoading(true);
    const { data } = await supabase
      .from("rss_feeds")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setFeeds((data ?? []) as Feed[]);
    setRssLoading(false);
  }, [user]);

  useEffect(() => {
    loadAuto();
    loadRss();
    loadCoverage();
    loadSuggestions(true);
  }, [loadAuto, loadCoverage, loadRss, loadSuggestions]);

  const addRss = async () => {
    if (!user || !rssName.trim() || !rssUrl.trim()) {
      toast({ title: "Navn og URL kreves", variant: "destructive" });
      return;
    }
    setRssAdding(true);
    const { error } = await supabase.from("rss_feeds").insert({
      user_id: user.id,
      name: rssName.trim(),
      url: rssUrl.trim(),
    });
    setRssAdding(false);
    if (error) toast({ title: "Feilet", description: error.message, variant: "destructive" });
    else {
      setRssName("");
      setRssUrl("");
      loadRss();
    }
  };

  const toggleRss = async (f: Feed) => {
    await supabase.from("rss_feeds").update({ is_active: !f.is_active }).eq("id", f.id);
    loadRss();
  };

  const removeRss = async (id: string) => {
    if (!confirm("Slett feeden?")) return;
    await supabase.from("rss_feeds").delete().eq("id", id);
    loadRss();
  };

  const pollRss = async (feedId?: string) => {
    setRssPolling(feedId ?? "all");
    try {
      const { data, error } = await supabase.functions.invoke("poll-rss", {
        body: feedId ? { feedId, userId: user!.id } : { userId: user!.id },
      });
      if (error) throw error;
      const d: any = data;
      toast({
        title: "Sjekket",
        description: `${d.feeds ?? 0} feed(s), ${d.newItems ?? 0} nye jobber.`,
      });
      loadRss();
    } catch (e: any) {
      toast({ title: "Feilet", description: e.message, variant: "destructive" });
    } finally {
      setRssPolling(null);
    }
  };

  const StatusBadge = ({ s }: { s: Status }) => {
    if (s === "ok")
      return (
        <Badge variant="secondary" className="gap-1">
          <CheckCircle2 className="w-3 h-3" /> OK
        </Badge>
      );
    if (s === "blocked")
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertTriangle className="w-3 h-3" /> Blokkert
        </Badge>
      );
    if (s === "error")
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertTriangle className="w-3 h-3" /> Feil
        </Badge>
      );
    return <Badge variant="outline">Ikke kjørt</Badge>;
  };

  const totalActive = autoItems.filter((a) => a.is_active).length + feeds.filter((f) => f.is_active).length;
  const totalFound = autoItems.reduce((s, a) => s + a.items_found, 0) + feeds.reduce((s, f) => s + f.items_found, 0);

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 lg:p-10 space-y-6">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold">Kilder</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Auto-søk og RSS-feeds som overvåker jobbmarkedet for deg.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">{totalActive} aktive</Badge>
          <Badge variant="outline">{totalFound} treff totalt</Badge>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="w-4 h-4 text-primary" />
            Full-match dekning
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Bred cache brukes som bakgrunnsdekning. Første matcher bruker profilstyrte Arbeidsplassen-søk og Finn/RSS-treff.
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            { key: "arbeidsplassen", label: "Arbeidsplassen", action: "Oppdater bred NAV-cache" },
            { key: "finn", label: "Finn", action: "Hent RSS fallback" },
          ].map((s) => {
            const state = sourceStates.find((item) => item.provider === s.key);
            return (
              <div key={s.key} className="border border-border rounded-md p-3 bg-muted/20">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-sm">{s.label}</div>
                    <div className="text-2xl font-semibold mt-2">{externalCounts[s.key] ?? 0}</div>
                    <div className="text-xs text-muted-foreground">aktive annonser i cache</div>
                    {state?.last_error && <div className="text-xs text-warning mt-2 line-clamp-2">{state.last_error}</div>}
                  </div>
                  <StatusBadge
                    s={(
                      state?.last_status === "partial"
                        ? "ok"
                        : state?.last_status === "needs_access"
                        ? "blocked"
                        : state?.last_status ?? "pending"
                    ) as Status}
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => runFullSource(s.key as "arbeidsplassen" | "finn")}
                  disabled={fullRunning !== null}
                >
                  {fullRunning === s.key ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                  {s.action}
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Wand2 className="w-4 h-4 text-primary" />
              Profilstyrte søkeforslag
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Appen foreslår smale Finn- og Arbeidsplassen-søk fra profil, CV, interesser og matcher. Disse brukes først når jobbene matches.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Switch checked={suggestionsEnabled} onCheckedChange={setAutoSuggestionsEnabled} />
            <span className="text-xs text-muted-foreground">{suggestionsEnabled ? "På" : "Av"}</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-xs text-muted-foreground">
              {sourceSuggestions.length} forslag · åpne søket, eller kopier teksten og lim den inn i søkefeltet.
            </div>
            <Button variant="outline" size="sm" onClick={() => generateSuggestions(true)} disabled={suggestionsRunning || !suggestionsEnabled}>
              {suggestionsRunning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Oppdater forslag
            </Button>
          </div>

          {suggestionsLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Klargjør kildeforslag...
            </div>
          ) : sourceSuggestions.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Ingen forslag ennå. Fyll ut interesseprofilen eller kjør matching først.
            </div>
          ) : (
            <div className="space-y-2">
              {sourceSuggestions.map((suggestion) => (
                <div key={suggestion.id} className="rounded-md border border-border bg-card p-3 space-y-3">
                  <div className="flex items-start gap-3">
                    <Switch
                      checked={suggestion.is_active && suggestion.status !== "paused"}
                      onCheckedChange={(checked) =>
                        updateSuggestion(suggestion.id, {
                          is_active: checked,
                          status: checked ? "suggested" : "paused",
                        } as Partial<SourceSuggestion>)
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{suggestion.name}</span>
                        <Badge variant="outline">{SOURCE_PROVIDER_LABEL[suggestion.provider]}</Badge>
                        <Badge variant="secondary">{suggestion.confidence}%</Badge>
                        {suggestion.status === "active" && suggestion.provider === "finn" && <Badge variant="outline">RSS koblet</Badge>}
                      </div>
                      {suggestion.reason && <p className="text-xs text-muted-foreground mt-1">{suggestion.reason}</p>}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => copySuggestionSearch(suggestion)} aria-label="Kopier søketekst">
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" asChild>
                        <a href={suggestion.search_url} target="_blank" rel="noreferrer">
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => dismissSuggestion(suggestion.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 md:pl-12">
                    <div className="space-y-1">
                      <Label className="text-[11px]">Søkeord</Label>
                      <Input value={suggestion.query} onChange={(e) => updateSuggestion(suggestion.id, { query: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">Sted</Label>
                      <Input value={suggestion.location ?? ""} onChange={(e) => updateSuggestion(suggestion.id, { location: e.target.value || null })} />
                    </div>
                    {suggestion.provider === "finn" ? (
                      <div className="space-y-1">
                        <Label className="text-[11px]">RSS fra lagret Finn-søk</Label>
                        <div className="flex gap-2">
                          <Input
                            value={suggestion.rss_url ?? ""}
                            onChange={(e) => updateSuggestion(suggestion.id, { rss_url: e.target.value || null })}
                            placeholder="https://..."
                          />
                          <Button variant="outline" onClick={() => connectSuggestionRss(suggestion)}>
                            Koble
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <Label className="text-[11px]">Kopier til Arbeidsplassen</Label>
                        <Button variant="outline" className="w-full justify-start min-w-0" onClick={() => copySuggestionSearch(suggestion)}>
                          <Copy className="w-4 h-4 mr-2" />
                          <span className="truncate">{buildSourceSearchText(suggestion.query, suggestion.location)}</span>
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="auto" className="space-y-5">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="auto" className="gap-2">
            <Sparkles className="w-3.5 h-3.5" />
            Auto-søk
            {autoItems.length > 0 && <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px]">{autoItems.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="rss" className="gap-2">
            <Rss className="w-3.5 h-3.5" />
            RSS-feeds
            {feeds.length > 0 && <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px]">{feeds.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        {/* ============= AUTO-SØK ============= */}
        <TabsContent value="auto" className="space-y-4">
          <Card className="border-dashed bg-muted/30">
            <CardContent className="p-4 flex items-start gap-3">
              <Info className="w-4 h-4 mt-0.5 text-primary shrink-0" />
              <div className="text-xs text-muted-foreground">
                La appen sjekke <strong>Finn, Arbeidsplassen og LinkedIn</strong> for deg. Mest pålitelig: Arbeidsplassen.
                Auto-søk kjører <strong>automatisk hver time</strong>. Når en ny jobb scorer ≥ 90 får du varsel i bjella oppe til høyre og på dashbordet.
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">Nytt auto-søk</CardTitle>
              <Button variant="outline" size="sm" onClick={() => runAuto()} disabled={autoRunning !== null || autoItems.length === 0}>
                {autoRunning === "all" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                Kjør alle nå
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Navn</Label>
                  <Input value={autoName} onChange={(e) => setAutoName(e.target.value)} placeholder="Frontend Oslo" />
                </div>
                <div className="space-y-2">
                  <Label>Kilde</Label>
                  <Select value={autoSource} onValueChange={(v) => setAutoSource(v as Source)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="arbeidsplassen">Arbeidsplassen (NAV) – mest pålitelig</SelectItem>
                      <SelectItem value="finn">Finn.no – kan bli blokkert</SelectItem>
                      <SelectItem value="linkedin">LinkedIn – krever manuell oppskrift</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Søkeord</Label>
                  <Input value={autoQuery} onChange={(e) => setAutoQuery(e.target.value)} placeholder="frontend utvikler" />
                </div>
                <div className="space-y-2">
                  <Label>Sted (valgfritt)</Label>
                  <Input value={autoLocation} onChange={(e) => setAutoLocation(e.target.value)} placeholder="Oslo" />
                </div>
              </div>
              <Button onClick={addAuto} disabled={autoAdding}>
                {autoAdding ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                Legg til auto-søk
              </Button>
            </CardContent>
          </Card>

          {autoLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Laster…
            </div>
          ) : autoItems.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center text-muted-foreground">
                <Search className="w-8 h-8 mx-auto mb-3 opacity-40" />
                <p>Ingen auto-søk ennå.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {autoItems.map((s) => (
                <Card key={s.id}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start gap-4">
                      <Switch checked={s.is_active} onCheckedChange={() => toggleAuto(s)} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{s.name}</span>
                          <Badge variant="outline" className="text-xs">{SOURCE_LABEL[s.source]}</Badge>
                          <StatusBadge s={s.last_status} />
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          "{s.query}"{s.location ? ` · ${s.location}` : ""} · {s.items_found} jobber funnet totalt
                          {s.last_checked_at && (
                            <> · sist {formatDistanceToNow(new Date(s.last_checked_at), { addSuffix: true, locale: nb })}</>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button variant="ghost" size="sm" onClick={() => runAuto(s.id)} disabled={autoRunning !== null}>
                          {autoRunning === s.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => removeAuto(s.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    {s.blocked_hint && (
                      <div className="md:ml-12 p-3 rounded-md bg-muted/60 border border-border text-xs whitespace-pre-line">
                        <div className="font-medium mb-1 flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
                          Manuell oppskrift
                        </div>
                        {s.blocked_hint}
                      </div>
                    )}
                    {s.last_status === "error" && s.last_error && !s.blocked_hint && (
                      <div className="md:ml-12 text-xs text-destructive">{s.last_error}</div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ============= RSS ============= */}
        <TabsContent value="rss" className="space-y-4">
          <Card className="border-dashed bg-muted/30">
            <CardContent className="p-4 flex items-start gap-3">
              <Info className="w-4 h-4 mt-0.5 text-primary shrink-0" />
              <div className="text-xs text-muted-foreground">
                Bruk RSS når du allerede har et lagret søk på Finn eller andre sider. Sjekkes <strong>automatisk hver time</strong>.
                <br />
                <strong>På finn.no:</strong> gjør et søk → "Lagre søk" → finn RSS-lenken under "Mine sider → Lagrede søk".
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">Legg til RSS-feed</CardTitle>
              <Button variant="outline" size="sm" onClick={() => pollRss()} disabled={rssPolling !== null || feeds.length === 0}>
                {rssPolling === "all" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                Sjekk alle nå
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label>Navn</Label>
                  <Input value={rssName} onChange={(e) => setRssName(e.target.value)} placeholder="f.eks. Finn – Utvikler Oslo" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>RSS-URL</Label>
                  <Input value={rssUrl} onChange={(e) => setRssUrl(e.target.value)} placeholder="https://www.finn.no/job/...rss" />
                </div>
              </div>
              <Button onClick={addRss} disabled={rssAdding}>
                {rssAdding ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                Legg til feed
              </Button>
            </CardContent>
          </Card>

          {rssLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Laster…
            </div>
          ) : feeds.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center text-muted-foreground">
                <Rss className="w-8 h-8 mx-auto mb-3 opacity-40" />
                <p>Ingen feeds ennå.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {feeds.map((f) => (
                <Card key={f.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <Switch checked={f.is_active} onCheckedChange={() => toggleRss(f)} />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">{f.name}</div>
                        <div className="text-xs text-muted-foreground truncate">{f.url}</div>
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                          <span>{f.items_found} treff totalt</span>
                          {f.last_checked_at && (
                            <span>Sist sjekket {formatDistanceToNow(new Date(f.last_checked_at), { addSuffix: true, locale: nb })}</span>
                          )}
                          {f.last_error && (
                            <span className="text-destructive flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" /> {f.last_error}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button variant="ghost" size="sm" onClick={() => pollRss(f.id)} disabled={rssPolling !== null}>
                          {rssPolling === f.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => removeRss(f.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Sources;
