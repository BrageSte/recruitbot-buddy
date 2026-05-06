import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Briefcase,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Loader2,
  MapPin,
  Search,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  loadPreOnboardingDraft,
  normalizePreOnboardingDraft,
  savePreOnboardingDraft,
  type PreOnboardingDraft,
} from "@/lib/preOnboarding";

const examples = ["Produkt og kundeinnsikt", "Frontend Oslo hybrid", "Prosjekt og koordinering"];

type AnonMatch = {
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  provider: string;
  source_url: string | null;
  score: number;
};

const providerLabel: Record<string, string> = {
  arbeidsplassen: "Arbeidsplassen",
  finn: "Finn",
};

const Start = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, sendMagicLink } = useAuth();
  const [draft, setDraft] = useState<PreOnboardingDraft>(() => loadPreOnboardingDraft() ?? {});
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [moreOpen, setMoreOpen] = useState<boolean>(() => {
    const initial = loadPreOnboardingDraft();
    return Boolean(initial?.desiredTasks || initial?.location || initial?.dealbreakers || initial?.linkedinUrl);
  });
  const [matches, setMatches] = useState<AnonMatch[]>([]);
  const [matchLoading, setMatchLoading] = useState(false);
  const [matchError, setMatchError] = useState<string | null>(null);
  const matchSeqRef = useRef(0);

  useEffect(() => {
    if (user) navigate("/onboarding", { replace: true });
  }, [user, navigate]);

  useEffect(() => {
    savePreOnboardingDraft(draft);
  }, [draft]);

  const normalized = useMemo(() => normalizePreOnboardingDraft(draft), [draft]);
  const canSubmit = Boolean(normalized.email && (normalized.targetRoles || normalized.desiredTasks || normalized.linkedinUrl));

  const targetRoles = normalized.targetRoles ?? "";
  const desiredTasks = normalized.desiredTasks ?? "";
  const locationField = normalized.location ?? "";

  useEffect(() => {
    const keywords = [targetRoles, desiredTasks].filter(Boolean).join(" ").trim();
    if (keywords.length < 3) {
      setMatches([]);
      setMatchError(null);
      setMatchLoading(false);
      return;
    }
    setMatchLoading(true);
    setMatchError(null);
    const seq = ++matchSeqRef.current;
    const timer = window.setTimeout(async () => {
      try {
        const { data, error } = await supabase.functions.invoke("match-anonymous", {
          body: { keywords, location: locationField || undefined, limit: 3 },
        });
        if (matchSeqRef.current !== seq) return;
        if (error) throw error;
        const items: AnonMatch[] = Array.isArray((data as any)?.matches) ? (data as any).matches : [];
        setMatches(items);
      } catch (err) {
        if (matchSeqRef.current !== seq) return;
        console.warn("match-anonymous failed", err);
        setMatchError("Kunne ikke hente forhåndsvisning akkurat nå.");
        setMatches([]);
      } finally {
        if (matchSeqRef.current === seq) setMatchLoading(false);
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [targetRoles, desiredTasks, locationField]);

  const update = (patch: Partial<PreOnboardingDraft>) => setDraft((current) => ({ ...current, ...patch }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) {
      toast({
        title: "Legg inn litt mer først",
        description: "Skriv minst hva du vil finne, og e-postadressen din.",
        variant: "destructive",
      });
      return;
    }

    setSending(true);
    savePreOnboardingDraft(normalized);
    const { error } = await sendMagicLink(normalized.email!, `${window.location.origin}/auth/callback`);
    setSending(false);

    if (error) {
      toast({ title: "Kunne ikke sende lenke", description: error.message, variant: "destructive" });
      return;
    }
    setSent(true);
  };

  const hasQuery = targetRoles.trim().length >= 3 || desiredTasks.trim().length >= 3;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="px-4 md:px-8 h-16 flex items-center justify-between border-b border-border/70">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
            <Briefcase className="w-4 h-4" />
          </div>
          <div className="font-semibold">Jobbhjelpen</div>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/auth">Logg inn</Link>
        </Button>
      </header>

      <main className="lg:min-h-[calc(100vh-4rem)] grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_460px]">
        <section className="px-4 md:px-8 lg:px-14 py-8 md:py-12 flex items-center order-2 lg:order-1">
          <motion.form
            onSubmit={submit}
            className="w-full max-w-2xl space-y-7"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
          >
            <div className="space-y-3">
              <Badge variant="secondary" className="rounded-md">Første matcher før du rydder alt</Badge>
              <h1 className="text-4xl md:text-6xl font-semibold tracking-tight leading-[1.02]">
                Se 3 jobber som passer deg på 30 sekunder.
              </h1>
              <p className="text-base md:text-lg text-muted-foreground max-w-xl">
                Slutt å scrolle hundrevis av Finn-annonser. Beskriv hva du vil ha — så luker vi bort resten.
              </p>
              <p className="text-sm text-muted-foreground/90 max-w-xl">
                Bygger oppå Finn og Arbeidsplassen, men matcher mot din profil — ikke nøkkelord.
              </p>
            </div>

            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="targetRoles" className="text-base">Hva vil du finne?</Label>
                <Input
                  id="targetRoles"
                  value={draft.targetRoles ?? ""}
                  onChange={(event) => update({ targetRoles: event.target.value })}
                  placeholder="Produktleder, frontend, kundesuksess..."
                  className="h-12 text-base"
                  autoFocus
                />
                <div className="flex flex-wrap gap-1.5">
                  {examples.map((example) => (
                    <button
                      key={example}
                      type="button"
                      onClick={() => update({ targetRoles: example })}
                      className="text-xs px-2 py-1 rounded-md bg-muted hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>

              <Collapsible open={moreOpen} onOpenChange={setMoreOpen}>
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ChevronDown className={`w-4 h-4 transition-transform ${moreOpen ? "rotate-180" : ""}`} />
                    {moreOpen ? "Skjul ekstra kontekst" : "Legg til mer kontekst (valgfritt)"}
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-4 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="desiredTasks">Hva vil du gjøre mer av?</Label>
                      <Textarea
                        id="desiredTasks"
                        rows={3}
                        value={draft.desiredTasks ?? ""}
                        onChange={(event) => update({ desiredTasks: event.target.value })}
                        placeholder="Kundebehov, analyse, produktutvikling..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="location">Hvor kan jobben være?</Label>
                      <Textarea
                        id="location"
                        rows={3}
                        value={draft.location ?? ""}
                        onChange={(event) => update({ location: event.target.value })}
                        placeholder="Oslo hybrid, Bergen, remote fra Norge..."
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="dealbreakers">Hva er uaktuelt?</Label>
                      <Input
                        id="dealbreakers"
                        value={draft.dealbreakers ?? ""}
                        onChange={(event) => update({ dealbreakers: event.target.value })}
                        placeholder="Mye reising, natt/helg, provisjon..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="linkedinUrl">LinkedIn URL</Label>
                      <Input
                        id="linkedinUrl"
                        value={draft.linkedinUrl ?? ""}
                        onChange={(event) => update({ linkedinUrl: event.target.value })}
                        placeholder="https://linkedin.com/in/..."
                      />
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              <div className="lg:hidden">
                <MobilePreviewStrip matches={matches} loading={matchLoading} hasQuery={hasQuery} error={matchError} />
              </div>

              <div className="space-y-2 pt-2 border-t border-border/60">
                <Label htmlFor="email">E-post for å lagre matchene</Label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    id="email"
                    type="email"
                    value={draft.email ?? ""}
                    onChange={(event) => update({ email: event.target.value })}
                    placeholder="deg@epost.no"
                    className="h-12 text-base"
                  />
                  <Button type="submit" size="lg" disabled={sending || !canSubmit} className="h-12 shrink-0">
                    {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ArrowRight className="w-4 h-4 mr-2" />}
                    Lagre og fortsett
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Ingen passord nå — vi sender en innloggingslenke. Vi lagrer ikke i databasen før du åpner lenken.
                </p>
              </div>
            </div>

            {sent && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm flex items-start gap-2"
              >
                <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-600" />
                <div>
                  <div className="font-medium">Sjekk e-posten din</div>
                  <p className="text-muted-foreground mt-1">
                    Åpne lenken på denne enheten, så fortsetter Jobbhjelpen med matchene du nettopp så.
                  </p>
                </div>
              </motion.div>
            )}
          </motion.form>
        </section>

        <aside className="hidden lg:flex border-t lg:border-t-0 lg:border-l border-border bg-muted/25 px-4 md:px-8 py-8 md:py-12 items-center order-1 lg:order-2">
          <motion.div
            className="w-full max-w-lg mx-auto space-y-5"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35, delay: 0.08 }}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-medium uppercase text-muted-foreground">Mens du skriver</div>
                <h2 className="text-2xl font-semibold mt-2">Forhåndsvisning</h2>
              </div>
              {matchLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
            </div>

            <PreviewBody
              matches={matches}
              loading={matchLoading}
              hasQuery={hasQuery}
              error={matchError}
              location={locationField}
              dealbreakers={normalized.dealbreakers ?? ""}
            />

            <p className="text-xs text-muted-foreground">
              Ingen e-post nødvendig for forhåndsvisning. Etter innlogging kan du legge til CV og finjustere alt før første matching kjøres.
            </p>
          </motion.div>
        </aside>
      </main>
    </div>
  );
};

const PreviewBody = ({
  matches,
  loading,
  hasQuery,
  error,
  location,
  dealbreakers,
}: {
  matches: AnonMatch[];
  loading: boolean;
  hasQuery: boolean;
  error: string | null;
  location: string;
  dealbreakers: string;
}) => {
  if (!hasQuery) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-background/40 p-6 text-center space-y-3">
        <div className="mx-auto w-10 h-10 rounded-full bg-muted flex items-center justify-center">
          <Search className="w-4 h-4 text-muted-foreground" />
        </div>
        <div className="text-sm font-medium">Skriv hva du leter etter</div>
        <p className="text-sm text-muted-foreground">
          Vi viser opptil 3 reelle stillinger fra Arbeidsplassen og Finn her — ingen e-post nødvendig.
        </p>
      </div>
    );
  }

  if (error && matches.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-background p-4 text-sm text-muted-foreground">
        {error}
      </div>
    );
  }

  if (matches.length === 0 && loading) {
    return (
      <div className="space-y-3">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-background p-4 text-sm text-muted-foreground">
        Ingen treff ennå. Prøv mer spesifikke ord eller flere roller.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {matches.map((match) => (
        <MatchCard key={match.id} match={match} />
      ))}

      {(location || dealbreakers) && (
        <div className="rounded-md bg-muted/60 p-3 text-xs space-y-2">
          {location && (
            <div className="flex items-start gap-2">
              <MapPin className="w-3.5 h-3.5 mt-0.5 text-primary" />
              <span className="text-muted-foreground whitespace-pre-line">{location}</span>
            </div>
          )}
          {dealbreakers && (
            <div className="flex items-start gap-2">
              <Sparkles className="w-3.5 h-3.5 mt-0.5 text-primary" />
              <span className="text-muted-foreground whitespace-pre-line">Styr unna: {dealbreakers}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const MatchCard = ({ match }: { match: AnonMatch }) => {
  const subtitle = [match.company, match.location].filter(Boolean).join(" · ");
  const provider = providerLabel[match.provider] ?? match.provider;
  return (
    <div className="rounded-lg border border-border bg-background p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold leading-snug truncate">{match.title}</div>
          {subtitle && <div className="text-xs text-muted-foreground mt-0.5 truncate">{subtitle}</div>}
        </div>
        <Badge variant="secondary" className="shrink-0 rounded-md">
          {provider}
        </Badge>
      </div>
      {match.source_url && (
        <a
          href={match.source_url}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-xs text-primary hover:underline"
          onClick={(event) => event.stopPropagation()}
        >
          Se annonsen <ExternalLink className="w-3 h-3" />
        </a>
      )}
    </div>
  );
};

const SkeletonCard = () => (
  <div className="rounded-lg border border-border bg-background p-4 shadow-sm animate-pulse">
    <div className="h-3 w-2/3 bg-muted rounded" />
    <div className="h-2.5 w-1/2 bg-muted rounded mt-2" />
  </div>
);

const MobilePreviewStrip = ({
  matches,
  loading,
  hasQuery,
  error,
}: {
  matches: AnonMatch[];
  loading: boolean;
  hasQuery: boolean;
  error: string | null;
}) => {
  if (!hasQuery) return null;

  if (loading && matches.length === 0) {
    return (
      <div className="rounded-md border border-border bg-muted/30 p-3 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Henter forhåndsvisning…
      </div>
    );
  }

  if (error && matches.length === 0) {
    return (
      <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
        {error}
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
        Ingen treff ennå — prøv mer spesifikke ord.
      </div>
    );
  }

  const top = matches[0];
  const subtitle = [top.company, top.location].filter(Boolean).join(" · ");
  const provider = providerLabel[top.provider] ?? top.provider;
  return (
    <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
      <div className="text-xs uppercase font-medium text-muted-foreground flex items-center gap-1.5">
        <Sparkles className="w-3 h-3" />
        Eksempel på match
        {matches.length > 1 && <span className="text-muted-foreground/70">(+{matches.length - 1} til etter innlogging)</span>}
      </div>
      <div>
        <div className="text-sm font-semibold leading-snug">{top.title}</div>
        {subtitle && <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>}
        <div className="text-[10px] text-muted-foreground/80 mt-1">{provider}</div>
      </div>
    </div>
  );
};

export default Start;
