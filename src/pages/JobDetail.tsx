import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScoreBadge } from "@/components/ScoreBadge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, Sparkles, ExternalLink, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const JobDetail = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => { load(); }, [id]);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const { data } = await supabase.from("jobs").select("*").eq("id", id).maybeSingle();
    setJob(data);
    setLoading(false);
  };

  const generateApplication = async () => {
    if (!job || !user) return;
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-application", { body: { jobId: job.id } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast({ title: "Søknad generert" });
      navigate(`/applications/${(data as any).applicationId}`);
    } catch (e: any) {
      toast({ title: "Feilet", description: e.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const remove = async () => {
    if (!job) return;
    if (!confirm("Slett denne jobben?")) return;
    await supabase.from("jobs").delete().eq("id", job.id);
    navigate("/jobs");
  };

  const saveNotes = async (notes: string) => {
    setJob({ ...job, notes });
    await supabase.from("jobs").update({ notes }).eq("id", job.id);
  };

  if (loading) return <div className="p-8 flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Laster…</div>;
  if (!job) return <div className="p-8">Jobb ikke funnet. <Link to="/jobs" className="text-primary underline">Tilbake</Link></div>;

  return (
    <div className="max-w-5xl mx-auto p-6 lg:p-10 space-y-6">
      <Link to="/jobs" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" /> Tilbake til jobber
      </Link>

      <header className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <ScoreBadge score={job.match_score} className="text-base px-3 py-1" />
            <h1 className="text-2xl font-semibold">{job.title}</h1>
          </div>
          <p className="text-muted-foreground mt-1">
            {job.company}{job.location && ` · ${job.location}`}
            {job.source_url && (
              <a href={job.source_url} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 text-primary hover:underline text-sm">
                <ExternalLink className="w-3 h-3" /> Kilde
              </a>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={generateApplication} disabled={generating}>
            {generating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Genererer…</> : <><Sparkles className="w-4 h-4 mr-2" /> Generer søknad</>}
          </Button>
          <Button variant="outline" size="icon" onClick={remove}><Trash2 className="w-4 h-4" /></Button>
        </div>
      </header>

      {job.ai_summary && (
        <Card>
          <CardHeader><CardTitle className="text-base">AI-oppsummering</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm">{job.ai_summary}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Fag", v: job.score_professional },
          { label: "Kultur", v: job.score_culture },
          { label: "Praktisk", v: job.score_practical },
          { label: "Entusiasme", v: job.score_enthusiasm },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{s.label}</span>
              <ScoreBadge score={s.v} />
            </CardContent>
          </Card>
        ))}
      </div>

      {job.risk_flags && job.risk_flags.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base text-warning">Risk flags</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {job.risk_flags.map((f: string, i: number) => <li key={i}>⚠ {f}</li>)}
            </ul>
          </CardContent>
        </Card>
      )}

      {job.description && (
        <Card>
          <CardHeader><CardTitle className="text-base">Stillingstekst</CardTitle></CardHeader>
          <CardContent>
            <div className="prose-app max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{job.description}</ReactMarkdown>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Notater</CardTitle></CardHeader>
        <CardContent>
          <Textarea rows={4} value={job.notes ?? ""} onChange={(e) => saveNotes(e.target.value)} placeholder="Egne notater om denne jobben…" />
        </CardContent>
      </Card>
    </div>
  );
};

export default JobDetail;
