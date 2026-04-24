import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, RefreshCw, Search, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { nb } from "date-fns/locale";

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

const SOURCE_LABEL: Record<Source, string> = {
  finn: "Finn.no",
  arbeidsplassen: "Arbeidsplassen (NAV)",
  linkedin: "LinkedIn",
};

const AutoSearchPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<AutoSearch[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [running, setRunning] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [source, setSource] = useState<Source>("arbeidsplassen");
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");

  useEffect(() => { load(); }, [user]);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("auto_searches")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setItems((data ?? []) as AutoSearch[]);
    setLoading(false);
  };

  const add = async () => {
    if (!user || !name.trim() || !query.trim()) {
      toast({ title: "Navn og søkeord kreves", variant: "destructive" });
      return;
    }
    setAdding(true);
    const { error } = await supabase.from("auto_searches").insert({
      user_id: user.id,
      name: name.trim(),
      source,
      query: query.trim(),
      location: location.trim() || null,
    });
    setAdding(false);
    if (error) toast({ title: "Feilet", description: error.message, variant: "destructive" });
    else { setName(""); setQuery(""); setLocation(""); load(); }
  };

  const toggle = async (s: AutoSearch) => {
    await supabase.from("auto_searches").update({ is_active: !s.is_active }).eq("id", s.id);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Slett auto-søket?")) return;
    await supabase.from("auto_searches").delete().eq("id", id);
    load();
  };

  const runNow = async (searchId?: string) => {
    setRunning(searchId ?? "all");
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
      load();
    } catch (e: any) {
      toast({ title: "Feilet", description: e.message, variant: "destructive" });
    } finally {
      setRunning(null);
    }
  };

  const StatusBadge = ({ s }: { s: Status }) => {
    if (s === "ok") return <Badge variant="secondary" className="gap-1"><CheckCircle2 className="w-3 h-3" /> OK</Badge>;
    if (s === "blocked") return <Badge variant="destructive" className="gap-1"><AlertTriangle className="w-3 h-3" /> Blokkert</Badge>;
    if (s === "error") return <Badge variant="destructive" className="gap-1"><AlertTriangle className="w-3 h-3" /> Feil</Badge>;
    return <Badge variant="outline">Ikke kjørt</Badge>;
  };

  return (
    <div className="max-w-4xl mx-auto p-6 lg:p-10 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Auto-søk</h1>
          <p className="text-muted-foreground text-sm mt-1">
            La appen sjekke Finn, Arbeidsplassen og LinkedIn for deg – uten manuelle RSS-feeds.
          </p>
        </div>
        <Button variant="outline" onClick={() => runNow()} disabled={running !== null || items.length === 0}>
          {running === "all" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          Kjør alle nå
        </Button>
      </header>

      <Card>
        <CardHeader><CardTitle className="text-base">Nytt auto-søk</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Navn</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Frontend Oslo" />
            </div>
            <div className="space-y-2">
              <Label>Kilde</Label>
              <Select value={source} onValueChange={(v) => setSource(v as Source)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="arbeidsplassen">Arbeidsplassen (NAV) – mest pålitelig</SelectItem>
                  <SelectItem value="finn">Finn.no – kan bli blokkert</SelectItem>
                  <SelectItem value="linkedin">LinkedIn – krever manuell oppskrift</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Søkeord</Label>
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="frontend utvikler" />
            </div>
            <div className="space-y-2">
              <Label>Sted (valgfritt)</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Oslo" />
            </div>
          </div>
          <Button onClick={add} disabled={adding}>
            {adding ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            Legg til
          </Button>
          <p className="text-xs text-muted-foreground flex items-start gap-2">
            <Info className="w-3 h-3 mt-0.5 shrink-0" />
            Hvis en kilde blokkerer skraping, får du en oppskrift på hvordan du legger inn søket som RSS i stedet.
          </p>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Laster…</div>
      ) : items.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">
          <Search className="w-8 h-8 mx-auto mb-3 opacity-40" />
          <p>Ingen auto-søk ennå.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {items.map((s) => (
            <Card key={s.id}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start gap-4">
                  <Switch checked={s.is_active} onCheckedChange={() => toggle(s)} />
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
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => runNow(s.id)} disabled={running !== null}>
                      {running === s.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => remove(s.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {s.blocked_hint && (
                  <div className="ml-12 p-3 rounded-md bg-muted/60 border border-border text-xs whitespace-pre-line">
                    <div className="font-medium mb-1 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
                      Manuell oppskrift
                    </div>
                    {s.blocked_hint}
                  </div>
                )}
                {s.last_status === "error" && s.last_error && !s.blocked_hint && (
                  <div className="ml-12 text-xs text-destructive">{s.last_error}</div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default AutoSearchPage;
