import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Briefcase, FileText, Loader2, Sparkles, Upload, Wand2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScoreBadge } from "@/components/ScoreBadge";
import { savePreOnboardingDraft } from "@/lib/preOnboarding";
import { SAMPLE_CVS, scoreDemoJobs, type DemoJob, type ScoredDemoJob } from "@/lib/demoScoring";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const fileToText = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });

const cvToText = (cv: any): string => {
  if (!cv) return "";
  const parts: string[] = [];
  if (cv.full_name) parts.push(cv.full_name);
  if (cv.headline) parts.push(cv.headline);
  if (cv.intro) parts.push(cv.intro);
  for (const e of cv.experiences ?? []) {
    parts.push(`${e.title ?? ""} ${e.company ?? ""}`);
    if (e.description) parts.push(e.description);
    if (Array.isArray(e.bullets)) parts.push(e.bullets.join(" "));
    if (Array.isArray(e.technologies)) parts.push(e.technologies.join(" "));
  }
  for (const s of cv.skills ?? []) {
    if (Array.isArray(s.items)) parts.push(s.items.join(" "));
  }
  for (const p of cv.projects ?? []) {
    parts.push(`${p.name ?? ""} ${p.description ?? ""}`);
    if (Array.isArray(p.technologies)) parts.push(p.technologies.join(" "));
  }
  return parts.filter(Boolean).join("\n");
};

type Step = 1 | 2 | 3;

const Demo = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>(1);
  const [cvText, setCvText] = useState("");
  const [importing, setImporting] = useState(false);
  const [roles, setRoles] = useState("");
  const [location, setLocation] = useState("");
  const [dealbreakers, setDealbreakers] = useState("");
  const [jobs, setJobs] = useState<DemoJob[]>([]);

  const handleUpload = async (file: File) => {
    setImporting(true);
    try {
      let body: Record<string, unknown>;
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        body = { pdf_base64: await fileToBase64(file), mime_type: file.type || "application/pdf" };
      } else {
        body = { text: await fileToText(file) };
      }
      const { data, error } = await supabase.functions.invoke("import-cv", { body });
      if (error || !(data as any)?.cv) throw error ?? new Error("Tomt CV-svar");
      const text = cvToText((data as any).cv).trim();
      if (!text) throw new Error("Fant ikke lesbar tekst i CV-en");
      setCvText(text);
      toast({ title: "CV lest", description: "Vi har hentet ut teksten – juster gjerne før du går videre." });
    } catch (e: any) {
      toast({ title: "Kunne ikke lese CV", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  useEffect(() => {
    fetch("/demo-jobs.json")
      .then((r) => r.json())
      .then(setJobs)
      .catch(() => setJobs([]));
  }, []);

  const scored: ScoredDemoJob[] = useMemo(
    () => (jobs.length ? scoreDemoJobs(cvText, { roles, location, dealbreakers }, jobs) : []),
    [jobs, cvText, roles, location, dealbreakers],
  );

  const continueToSignup = () => {
    savePreOnboardingDraft({
      targetRoles: roles,
      location,
      dealbreakers,
      desiredTasks: cvText.slice(0, 500),
    });
    navigate("/start");
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="px-4 md:px-8 h-16 flex items-center justify-between border-b border-border/70">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
            <Briefcase className="w-4 h-4" />
          </div>
          <div className="font-semibold">Jobbhjelpen</div>
        </Link>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/auth">Logg inn</Link>
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 md:px-8 py-8 md:py-12">
        <Stepper step={step} />

        {step === 1 && (
          <StepCard title="Last opp CV eller velg eksempel" subtitle="Lim inn CV-tekst, eller bruk en av eksempelpersonene for å se hvordan matchingen funker.">
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {SAMPLE_CVS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setCvText(s.text)}
                    className="text-sm px-3 py-1.5 rounded-md border border-border/70 hover:bg-muted transition-colors"
                  >
                    Bruk eksempel: {s.label}
                  </button>
                ))}
              </div>
              <div className="space-y-2">
                <Label htmlFor="cv">CV-tekst</Label>
                <Textarea
                  id="cv"
                  rows={10}
                  value={cvText}
                  onChange={(e) => setCvText(e.target.value)}
                  placeholder="Lim inn CV-tekst her – eller velg et eksempel over."
                />
                <p className="text-xs text-muted-foreground">
                  Bare for demo. Teksten lagres ikke før du logger inn.
                </p>
              </div>
              <div className="flex justify-end">
                <Button disabled={!cvText.trim()} onClick={() => setStep(2)}>
                  Neste <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          </StepCard>
        )}

        {step === 2 && (
          <StepCard title="Hva leter du etter?" subtitle="Tre korte spørsmål så vi kan farge resultatet.">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="roles">Hva slags rolle?</Label>
                <Input id="roles" value={roles} onChange={(e) => setRoles(e.target.value)} placeholder="f.eks. produktleder, frontend, customer success" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="loc">Sted / arbeidsform</Label>
                <Input id="loc" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Oslo hybrid, remote, Bergen..." />
              </div>
              <div className="space-y-2">
                <Label htmlFor="deal">Dealbreakers</Label>
                <Input id="deal" value={dealbreakers} onChange={(e) => setDealbreakers(e.target.value)} placeholder="f.eks. mye reising, natt/helg" />
              </div>
              <div className="flex justify-between pt-2">
                <Button variant="ghost" onClick={() => setStep(1)}><ArrowLeft className="w-4 h-4 mr-2" /> Tilbake</Button>
                <Button onClick={() => setStep(3)}>Vis matchene <Sparkles className="w-4 h-4 ml-2" /></Button>
              </div>
            </div>
          </StepCard>
        )}

        {step === 3 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div className="flex items-end justify-between flex-wrap gap-3">
              <div>
                <Badge variant="secondary" className="rounded-md mb-2">Demo</Badge>
                <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Dine matcher</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Score basert på enkel sammenligning av CV og annonse. I appen brukes full AI-rekrutterer.
                </p>
              </div>
              <Button variant="outline" onClick={() => setStep(2)}>Endre svar</Button>
            </div>

            <div className="space-y-3">
              {scored.map((job) => (
                <div key={job.id} className="rounded-lg border border-border/70 bg-background p-4 md:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold">{job.title}</div>
                      <div className="text-sm text-muted-foreground">{job.company} · {job.location} · {job.source}</div>
                    </div>
                    <ScoreBadge score={job.score} />
                  </div>
                  <p className="text-sm text-muted-foreground mt-3">{job.summary}</p>
                  <ul className="mt-3 space-y-1 text-sm">
                    {job.reasons.map((r, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <Sparkles className="w-3.5 h-3.5 text-primary mt-1 shrink-0" />
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Frist {new Date(job.deadline).toLocaleDateString("nb-NO")}</span>
                    <Button size="sm" variant="outline" onClick={continueToSignup}>
                      <FileText className="w-3.5 h-3.5 mr-1.5" /> Lag søknad
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-border/70 bg-gradient-to-br from-primary/10 via-background to-background p-6 md:p-8 text-center space-y-3">
              <h2 className="text-xl md:text-2xl font-semibold tracking-tight">Klar for ekte matcher?</h2>
              <p className="text-sm text-muted-foreground max-w-xl mx-auto">
                Logg inn for å hente jobber fra Finn, LinkedIn, NAV og Arbeidsplassen – og generere tilpasset CV og søknad.
              </p>
              <div className="flex flex-col sm:flex-row gap-2 justify-center pt-1">
                <Button size="lg" onClick={continueToSignup} className="h-12">
                  <Wand2 className="w-4 h-4 mr-2" /> Lagre profilen og fortsett
                </Button>
                <Button size="lg" variant="outline" asChild className="h-12">
                  <Link to="/auth">Jeg har konto</Link>
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </main>
    </div>
  );
};

const Stepper = ({ step }: { step: Step }) => (
  <div className="flex items-center gap-2 mb-6 text-xs text-muted-foreground">
    {(["CV", "Mål", "Matcher"] as const).map((label, i) => {
      const n = (i + 1) as Step;
      const active = step === n;
      const done = step > n;
      return (
        <div key={label} className="flex items-center gap-2">
          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold ${active ? "bg-primary text-primary-foreground" : done ? "bg-emerald-500/15 text-emerald-600" : "bg-muted text-muted-foreground"}`}>{n}</span>
          <span className={active ? "text-foreground font-medium" : ""}>{label}</span>
          {i < 2 && <span className="w-6 h-px bg-border" />}
        </div>
      );
    })}
  </div>
);

const StepCard = ({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) => (
  <motion.section
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    className="rounded-xl border border-border/70 bg-background p-5 md:p-7"
  >
    <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">{title}</h1>
    {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
    <div className="mt-5">{children}</div>
  </motion.section>
);

export default Demo;
