import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ExternalLink, Sparkles, Loader2, ChevronDown, MapPin, Briefcase } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type Job = {
  id: string;
  title?: string | null;
  company?: string | null;
  location?: string | null;
  description?: string | null;
  source_url?: string | null;
  ai_summary?: string | null;
};

interface Props {
  job: Job;
  /** Auto-generate AI summary on mount when missing and a description exists. */
  autoGenerate?: boolean;
}

const hostFromUrl = (u?: string | null) => {
  if (!u) return null;
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return null; }
};

export const JobContextCard = ({ job, autoGenerate = true }: Props) => {
  const { toast } = useToast();
  const [summary, setSummary] = useState<string | null>(job.ai_summary ?? null);
  const [generating, setGenerating] = useState(false);
  const [openFull, setOpenFull] = useState(false);

  useEffect(() => {
    setSummary(job.ai_summary ?? null);
  }, [job.ai_summary, job.id]);

  const generate = async () => {
    if (!job.id) return;
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("summarize-job", {
        body: { jobId: job.id },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setSummary((data as any).summary);
    } catch (e: any) {
      toast({ title: "Kunne ikke lage sammendrag", description: e.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  // Auto-generate once if missing
  useEffect(() => {
    if (
      autoGenerate &&
      !summary &&
      !generating &&
      job.id &&
      job.description &&
      job.description.trim().length >= 30
    ) {
      generate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id]);

  const host = hostFromUrl(job.source_url);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-muted-foreground" />
              Stillingsannonse
            </CardTitle>
            <div className="mt-1 text-sm text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-0.5">
              {job.company && <span>{job.company}</span>}
              {job.location && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> {job.location}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {job.source_url && (
              <Button asChild variant="outline" size="sm">
                <a href={job.source_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4 mr-1.5" />
                  Original annonse
                  {host && <span className="ml-1.5 text-xs text-muted-foreground hidden sm:inline">{host}</span>}
                </a>
              </Button>
            )}
            {job.id && (
              <Button asChild variant="ghost" size="sm">
                <Link to={`/jobs/${job.id}`}>Åpne i jobbvisning</Link>
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5 flex items-center gap-1.5">
            <Sparkles className="w-3 h-3" /> AI-sammendrag
          </div>

          {summary ? (
            <div className="text-sm leading-relaxed bg-accent/40 rounded-md p-3 whitespace-pre-wrap">
              {summary}
            </div>
          ) : generating ? (
            <div className="text-sm text-muted-foreground flex items-center gap-2 p-3 border border-dashed border-border rounded-md">
              <Loader2 className="w-4 h-4 animate-spin" /> Lager sammendrag…
            </div>
          ) : (
            <div className="flex items-center gap-3 p-3 border border-dashed border-border rounded-md">
              <p className="text-sm text-muted-foreground flex-1">
                {job.description ? "Ingen sammendrag enda." : "Mangler annonsetekst — kan ikke lage sammendrag."}
              </p>
              {job.description && (
                <Button size="sm" variant="outline" onClick={generate}>
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Lag sammendrag
                </Button>
              )}
            </div>
          )}

          {summary && (
            <div className="mt-1.5 flex justify-end">
              <Button size="sm" variant="ghost" onClick={generate} disabled={generating}>
                {generating ? (
                  <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Genererer…</>
                ) : (
                  <><Sparkles className="w-3.5 h-3.5 mr-1.5" /> Generer på nytt</>
                )}
              </Button>
            </div>
          )}
        </div>

        {job.description && (
          <Collapsible open={openFull} onOpenChange={setOpenFull}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-between">
                <span>Vis full annonsetekst</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${openFull ? "rotate-180" : ""}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 text-sm whitespace-pre-wrap leading-relaxed border border-border rounded-md p-4 max-h-[480px] overflow-y-auto bg-card">
                {job.description}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
};
