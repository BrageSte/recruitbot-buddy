import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScoreBadge } from "@/components/ScoreBadge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Loader2, Sparkles, ExternalLink } from "lucide-react";
import { format } from "date-fns";

type Job = {
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  source: string;
  source_url: string | null;
  ai_summary: string | null;
  match_score: number | null;
  status: string;
  deadline: string | null;
  risk_flags: string[] | null;
  created_at: string;
};

const STATUSES = [
  { v: "discovered", label: "Oppdaget" },
  { v: "considering", label: "Vurderer" },
  { v: "applied", label: "Søkt" },
  { v: "interview", label: "Intervju" },
  { v: "offer", label: "Tilbud" },
  { v: "rejected", label: "Avslag" },
  { v: "archived", label: "Arkivert" },
];

const Jobs = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");

  useEffect(() => { load(); }, [user]);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase.from("jobs").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    setJobs((data ?? []) as any);
    setLoading(false);
  };

  const addJob = async () => {
    if (!user) return;
    if (!url && !text.trim()) {
      toast({ title: "Lim inn URL eller tekst", variant: "destructive" });
      return;
    }
    setAdding(true);
    try {
      const { data, error } = await supabase.functions.invoke("parse-job", { body: { url: url || null, text: text || null } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast({ title: "Jobb lagt til", description: "AI scorer den nå…" });
      setDialogOpen(false);
      setUrl(""); setText("");
      load();
    } catch (e: any) {
      toast({ title: "Feilet", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    await supabase.from("jobs").update({ status: status as any }).eq("id", id);
    load();
  };

  const filtered = filter === "all" ? jobs : jobs.filter((j) => j.status === filter);

  return (
    <div className="max-w-6xl mx-auto p-6 lg:p-10 space-y-6">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold">Jobber</h1>
          <p className="text-muted-foreground text-sm mt-1">Inbox med AI-scoring mot din profil.</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" /> Legg til jobb</Button>
          </DialogTrigger>
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
                <p className="text-xs text-muted-foreground">AI henter og parser siden.</p>
              </TabsContent>
              <TabsContent value="text" className="space-y-2 mt-4">
                <Label>Stillingstekst</Label>
                <Textarea rows={12} value={text} onChange={(e) => setText(e.target.value)} placeholder="Lim inn hele stillingsannonsen her…" />
              </TabsContent>
            </Tabs>
            <DialogFooter>
              <Button onClick={addJob} disabled={adding}>
                {adding ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> AI parser…</> : <><Sparkles className="w-4 h-4 mr-2" /> Legg til + score</>}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      <div className="flex flex-wrap gap-1.5">
        <Button variant={filter === "all" ? "default" : "outline"} size="sm" onClick={() => setFilter("all")}>Alle ({jobs.length})</Button>
        {STATUSES.map((s) => {
          const n = jobs.filter((j) => j.status === s.v).length;
          if (n === 0) return null;
          return (
            <Button key={s.v} variant={filter === s.v ? "default" : "outline"} size="sm" onClick={() => setFilter(s.v)}>
              {s.label} ({n})
            </Button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Laster…</div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">
          <p>Ingen jobber ennå. Klikk "Legg til jobb" for å starte.</p>
        </CardContent></Card>
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
                      <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                        <span className="px-1.5 py-0.5 bg-muted rounded">{STATUSES.find((s) => s.v === j.status)?.label ?? j.status}</span>
                        {j.deadline && <span>Frist {format(new Date(j.deadline), "dd.MM")}</span>}
                        {j.risk_flags && j.risk_flags.length > 0 && (
                          <span className="text-warning">⚠ {j.risk_flags.length} flag</span>
                        )}
                        {j.source_url && (
                          <a href={j.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground" onClick={(e) => e.stopPropagation()}>
                            <ExternalLink className="w-3 h-3" /> Kilde
                          </a>
                        )}
                      </div>
                    </div>
                    <select
                      value={j.status}
                      onChange={(e) => { e.preventDefault(); updateStatus(j.id, e.target.value); }}
                      onClick={(e) => e.preventDefault()}
                      className="text-xs border border-input rounded-md px-2 py-1 bg-background"
                    >
                      {STATUSES.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
                    </select>
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
