import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  ExternalLink,
  FileText,
  Layers,
  Loader2,
  Mail,
  Rss,
  Sparkles,
  Upload,
  Wand2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScoreBadge } from "@/components/ScoreBadge";
import { savePreOnboardingDraft } from "@/lib/preOnboarding";
import {
  SAMPLE_CVS,
  buildDemoKeywords,
  scoreDemoJobs,
  type DemoJob,
  type ScoredDemoJob,
} from "@/lib/demoScoring";
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

type LiveMatch = {
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  provider: string;
  source_url: string | null;
  score: number;
  deadline: string | null;
  matched_terms: string[];
};

type DemoMatch = {
  id: string;
  title: string;
  company: string;
  location: string;
  source: string;
  score: number;
  deadline: string | null;
  reasons: string[];
  matchedKeywords: string[];
  source_url: string | null;
  isFallback: boolean;
  summary?: string;
};

const providerLabel: Record<string, string> = {
  arbeidsplassen: "Arbeidsplassen",
  finn: "Finn",
};

const formatDeadline = (deadline: string | null | undefined) => {
  if (!deadline) return null;
  const d = new Date(deadline);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("nb-NO");
};

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
  const [fallbackJobs, setFallbackJobs] = useState<DemoJob[]>([]);
  const [liveMatches, setLiveMatches] = useState<LiveMatch[] | null>(null);
  const [matchLoading, setMatchLoading] = useState(false);
  const [matchError, setMatchError] = useState<string | null>(null);
  const matchSeqRef = useRef(0);

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
      .then(setFallbackJobs)
      .catch(() => setFallbackJobs([]));
  }, []);

  useEffect(() => {
    if (step !== 3) return;
    const keywords = buildDemoKeywords(cvText, roles);
    if (keywords.length < 3) {
      setLiveMatches(null);
      setMatchError(null);
      setMatchLoading(false);
      return;
    }
    setMatchLoading(true);
    setMatchError(null);
    const seq = ++matchSeqRef.current;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("match-anonymous", {
          body: {
            keywords,
            location: location || undefined,
            dealbreakers: dealbreakers || undefined,
            limit: 6,
          },
        });
        if (matchSeqRef.current !== seq) return;
        if (error) throw error;
        const items: LiveMatch[] = Array.isArray((data as any)?.matches) ? (data as any).matches : [];
        setLiveMatches(items);
      } catch (err) {
        if (matchSeqRef.current !== seq) return;
        console.warn("match-anonymous failed", err);
        setMatchError("Kunne ikke hente live matcher – viser eksempeldata.");
        setLiveMatches([]);
      } finally {
        if (matchSeqRef.current === seq) setMatchLoading(false);
      }
    })();
  }, [step, cvText, roles, location, dealbreakers]);

  const fallbackScored: ScoredDemoJob[] = useMemo(
    () => (fallbackJobs.length ? scoreDemoJobs(cvText, { roles, location, dealbreakers }, fallbackJobs) : []),
    [fallbackJobs, cvText, roles, location, dealbreakers],
  );

  const matches: DemoMatch[] = useMemo(() => {
    if (liveMatches && liveMatches.length > 0) {
      return liveMatches.map((m) => {
        const provider = providerLabel[m.provider] ?? m.provider;
        const reasons: string[] = [];
        if (m.matched_terms.length) {
          reasons.push(`Treff på ${m.matched_terms.slice(0, 4).join(", ")}`);
        }
        if (location && (m.location ?? "").toLowerCase().includes(location.toLowerCase().split(/[\s,/]+/)[0] ?? "")) {
          reasons.push(`Stedet matcher (${m.location})`);
        }
        if (dealbreakers) {
          reasons.push(`Sortert etter dealbreakers: ${dealbreakers}`);
        }
        if (!reasons.length) reasons.push("Aktiv stilling som ligner på det du leter etter.");
        return {
          id: m.id,
          title: m.title,
          company: m.company ?? "",
          location: m.location ?? "",
          source: provider,
          score: m.score,
          deadline: m.deadline,
          reasons,
          matchedKeywords: m.matched_terms,
          source_url: m.source_url,
          isFallback: false,
        };
      });
    }
    return fallbackScored.slice(0, 6).map((j) => ({
      id: j.id,
      title: j.title,
      company: j.company,
      location: j.location,
      source: j.source,
      score: j.score,
      deadline: j.deadline,
      reasons: j.reasons,
      matchedKeywords: j.matchedKeywords,
      source_url: null,
      isFallback: true,
      summary: j.summary,
    }));
  }, [liveMatches, fallbackScored, location, dealbreakers]);

  const usingFallback = matches.length > 0 && matches[0].isFallback;

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

      <main className="max-w-5xl mx-auto px-4 md:px-8 py-8 md:py-12">
        <Stepper step={step} />

        {step === 1 && (
          <StepCard
            title="Last opp CV eller skriv fritt om deg"
            subtitle="Bruk en ekte CV, beskriv deg selv med egne ord, eller velg en eksempelprofil."
          >
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6">
              <div className="space-y-4">
                <div className="rounded-lg border border-dashed border-border/70 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <Upload className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-sm font-medium">Last opp CV (PDF, TXT, MD)</div>
                      <p className="text-xs text-muted-foreground">Vi leser den med AI og fyller inn teksten under.</p>
                    </div>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept=".pdf,.txt,.md,text/plain,application/pdf"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUpload(file);
                      e.target.value = "";
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={importing}
                  >
                    {importing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                    {importing ? "Leser CV..." : "Velg fil"}
                  </Button>
                </div>

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
                  <Label htmlFor="cv">CV eller fri beskrivelse</Label>
                  <Textarea
                    id="cv"
                    rows={10}
                    value={cvText}
                    onChange={(e) => setCvText(e.target.value)}
                    placeholder="Lim inn CV – eller skriv fritt om hva du har gjort, hva du er god på og hva du vil mer av."
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

              <NextInAppPreview compact />
            </div>
          </StepCard>
        )}

        {step === 2 && (
          <StepCard title="Hva leter du etter?" subtitle="Tre korte spørsmål – brukes direkte i matchingen mot ekte annonser.">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="roles">Hva slags rolle?</Label>
                <Input
                  id="roles"
                  value={roles}
                  onChange={(e) => setRoles(e.target.value)}
                  placeholder="f.eks. produktleder, frontend, customer success"
                />
                <p className="text-xs text-muted-foreground">
                  Brukes som hovedsignal når vi rangerer mot Arbeidsplassen og FINN.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="loc">Sted / arbeidsform</Label>
                <Input
                  id="loc"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Oslo hybrid, remote, Bergen..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="deal">Dealbreakers</Label>
                <Input
                  id="deal"
                  value={dealbreakers}
                  onChange={(e) => setDealbreakers(e.target.value)}
                  placeholder="f.eks. mye reising, natt/helg, provisjon"
                />
                <p className="text-xs text-muted-foreground">
                  Vi trekker score for jobber som inneholder disse ordene.
                </p>
              </div>
              <div className="flex justify-between pt-2">
                <Button variant="ghost" onClick={() => setStep(1)}>
                  <ArrowLeft className="w-4 h-4 mr-2" /> Tilbake
                </Button>
                <Button onClick={() => setStep(3)}>
                  Vis matchene <Sparkles className="w-4 h-4 ml-2" />
                </Button>
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
                  Live søk mot Arbeidsplassen/NAV og FINN. Innlogget bruker du full AI-rekrutterer mot din profil.
                </p>
              </div>
              <Button variant="outline" onClick={() => setStep(2)}>Endre svar</Button>
            </div>

            {usingFallback && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                {matchError ? matchError : "Viser eksempeldata fordi vi ikke fant live treff for søket."}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6">
              <div className="space-y-3">
                {matchLoading && matches.length === 0 && (
                  <div className="rounded-lg border border-border bg-background p-6 flex items-center gap-3 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Søker etter aktive jobber...
                  </div>
                )}

                {!matchLoading && matches.length === 0 && (
                  <div className="rounded-lg border border-border bg-background p-6 text-sm text-muted-foreground">
                    Fant ingen treff akkurat nå. Prøv mer spesifikke roller eller fjern dealbreakers.
                  </div>
                )}

                {matches.map((job) => (
                  <div key={job.id} className="rounded-lg border border-border/70 bg-background p-4 md:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold">{job.title}</div>
                        <div className="text-sm text-muted-foreground">
                          {[job.company, job.location].filter(Boolean).join(" · ")}
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                          <Badge variant="secondary" className="rounded-md">
                            {job.isFallback ? `Eksempeldata · ${job.source}` : job.source}
                          </Badge>
                          {job.deadline && (
                            <span className="text-xs text-muted-foreground">
                              Frist {formatDeadline(job.deadline)}
                            </span>
                          )}
                        </div>
                      </div>
                      <ScoreBadge score={job.score} />
                    </div>
                    {job.summary && (
                      <p className="text-sm text-muted-foreground mt-3">{job.summary}</p>
                    )}
                    <ul className="mt-3 space-y-1 text-sm">
                      {job.reasons.map((r, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <Sparkles className="w-3.5 h-3.5 text-primary mt-1 shrink-0" />
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-4 flex items-center justify-between gap-2 flex-wrap">
                      {job.source_url ? (
                        <a
                          href={job.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-primary inline-flex items-center gap-1 hover:underline"
                        >
                          Se annonsen <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : <span />}
                      <Button size="sm" variant="outline" onClick={continueToSignup}>
                        <FileText className="w-3.5 h-3.5 mr-1.5" /> Lag søknad
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <NextInAppPreview />
            </div>

            <div className="rounded-2xl border border-border/70 bg-gradient-to-br from-primary/10 via-background to-background p-6 md:p-8 text-center space-y-3">
              <h2 className="text-xl md:text-2xl font-semibold tracking-tight">Klar for ekte matcher?</h2>
              <p className="text-sm text-muted-foreground max-w-xl mx-auto">
                Logg inn for å hente jobber kontinuerlig fra NAV/Arbeidsplassen og FINN – og generere tilpasset CV og søknad.
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

const NEXT_IN_APP: { icon: typeof Layers; title: string; body: string }[] = [
  {
    icon: Layers,
    title: "Skreddersydd CV per jobb",
    body: "Vi lager CV-varianter som fremhever det jobben faktisk spør etter.",
  },
  {
    icon: Mail,
    title: "Søknad og oppfølging",
    body: "Utkast til søknad, e-post til arbeidsgiver og påminnelser i pipelinen.",
  },
  {
    icon: Rss,
    title: "Egne jobbkilder",
    body: "Koble på flere RSS/feeder eller la oss foreslå nye basert på CV-en din.",
  },
];

const NextInAppPreview = ({ compact = false }: { compact?: boolean }) => (
  <aside className={`rounded-xl border border-border/70 bg-muted/25 p-4 md:p-5 space-y-4 ${compact ? "" : "lg:sticky lg:top-6"}`}>
    <div>
      <div className="text-xs font-medium uppercase text-muted-foreground">Etter innlogging</div>
      <h3 className="text-base font-semibold mt-1">Slik fortsetter Jobbhjelpen</h3>
    </div>
    <ul className="space-y-3">
      {NEXT_IN_APP.map(({ icon: Icon, title, body }) => (
        <li key={title} className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-md bg-background border border-border/70 flex items-center justify-center shrink-0 text-primary">
            <Icon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium">{title}</div>
            <p className="text-xs text-muted-foreground mt-0.5">{body}</p>
          </div>
        </li>
      ))}
    </ul>
  </aside>
);

export default Demo;
