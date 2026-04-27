import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScoreBadge } from "@/components/ScoreBadge";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, Sparkles, ExternalLink, Trash2, Wand2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

type CvVariant = { id: string; variant_name: string | null; variant_description: string | null; cv_style: string | null; is_default: boolean };

const JobDetail = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [variants, setVariants] = useState<CvVariant[]>([]);
  // "__ai__" means let AI choose; otherwise the cv_template_id.
  const [chosen, setChosen] = useState<string>("__ai__");

  useEffect(() => { load(); }, [id]);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const { data } = await supabase.from("jobs").select("*").eq("id", id).maybeSingle();
    setJob(data);
    setLoading(false);
  };

  const openPicker = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("cv_templates")
      .select("id, variant_name, variant_description, cv_style, is_default")
      .eq("user_id", user.id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true });
    const list = (data ?? []) as CvVariant[];
    setVariants(list);
    if (list.length === 0) {
      toast({ title: "Ingen CV", description: "Opprett en CV først under CV-fanen.", variant: "destructive" });
      return;
    }
    if (list.length === 1) {
      // Skip the dialog — only one CV exists.
      runGenerate(list[0].id, false);
      return;
    }
    setChosen("__ai__");
    setPickerOpen(true);
  };

  const runGenerate = async (cvTemplateId: string | null, letAiPick: boolean) => {
    if (!job || !user) return;
    setPickerOpen(false);
    setGenerating(true);
    try {
      const body: any = { jobId: job.id };
      if (letAiPick) body.letAiPick = true;
      else if (cvTemplateId) body.cvTemplateId = cvTemplateId;
      const { data, error } = await supabase.functions.invoke("generate-application", { body });
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

  const generateApplication = () => openPicker();

  const confirmPick = () => {
    if (chosen === "__ai__") runGenerate(null, true);
    else runGenerate(chosen, false);
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
  const reasoning = job.match_reasoning ?? {};
  const strengths = Array.isArray(reasoning.strengths) ? reasoning.strengths : [];
  const concerns = Array.isArray(reasoning.concerns) ? reasoning.concerns : [];
  const usedSignals = Array.isArray(reasoning.used_signals) ? reasoning.used_signals : [];

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

      {(reasoning.summary || strengths.length > 0 || concerns.length > 0) && (
        <Card>
          <CardHeader><CardTitle className="text-base">Matchforklaring</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {reasoning.summary && <p className="text-sm">{reasoning.summary}</p>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {strengths.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">Det som trekker opp</div>
                  {strengths.map((s: string, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span>{s}</span>
                    </div>
                  ))}
                </div>
              )}
              {concerns.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">Det som bør sjekkes</div>
                  {concerns.map((s: string, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                      <span>{s}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {reasoning.recommendation && (
              <div className="text-sm border border-border rounded-md p-3 bg-muted/30">{reasoning.recommendation}</div>
            )}
            {usedSignals.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {usedSignals.map((s: string, i: number) => (
                  <span key={i} className="text-xs px-2 py-1 rounded bg-accent text-accent-foreground">{s}</span>
                ))}
              </div>
            )}
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
