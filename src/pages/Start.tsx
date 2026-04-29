import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Briefcase, CheckCircle2, Loader2, MapPin, Search, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  loadPreOnboardingDraft,
  normalizePreOnboardingDraft,
  savePreOnboardingDraft,
  type PreOnboardingDraft,
} from "@/lib/preOnboarding";

const examples = ["Produkt og kundeinnsikt", "Frontend Oslo hybrid", "Prosjekt og koordinering"];

const Start = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, sendMagicLink } = useAuth();
  const [draft, setDraft] = useState<PreOnboardingDraft>(() => loadPreOnboardingDraft() ?? {});
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (user) navigate("/onboarding", { replace: true });
  }, [user, navigate]);

  useEffect(() => {
    savePreOnboardingDraft(draft);
  }, [draft]);

  const normalized = useMemo(() => normalizePreOnboardingDraft(draft), [draft]);
  const canSubmit = Boolean(normalized.email && (normalized.targetRoles || normalized.desiredTasks || normalized.linkedinUrl));
  const searchTerms = [normalized.targetRoles, normalized.desiredTasks]
    .filter(Boolean)
    .join(" ")
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 4);

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

      <main className="min-h-[calc(100vh-4rem)] grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_460px]">
        <section className="px-4 md:px-8 lg:px-14 py-8 md:py-12 flex items-center">
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
                Finn jobbene som faktisk passer.
              </h1>
              <p className="text-base md:text-lg text-muted-foreground max-w-xl">
                Svar kort nå. Jobbhjelpen lager en første profil og viser hva den vil lete etter før du fullfører oppsettet.
              </p>
            </div>

            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="targetRoles">Hva vil du finne?</Label>
                <Input
                  id="targetRoles"
                  value={draft.targetRoles ?? ""}
                  onChange={(event) => update({ targetRoles: event.target.value })}
                  placeholder="Produktleder, frontend, kundesuksess..."
                  className="h-12 text-base"
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="desiredTasks">Hva vil du gjøre mer av?</Label>
                  <Textarea
                    id="desiredTasks"
                    rows={4}
                    value={draft.desiredTasks ?? ""}
                    onChange={(event) => update({ desiredTasks: event.target.value })}
                    placeholder="Kundebehov, analyse, produktutvikling, koordinering..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="location">Hvor kan jobben være?</Label>
                  <Textarea
                    id="location"
                    rows={4}
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

              <div className="space-y-2">
                <Label htmlFor="email">E-post for å lagre profilen</Label>
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
                    Send innloggingslenke
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Ingen passord nå. Vi lagrer ikke dette i databasen før du åpner lenken.
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
                    Åpne lenken på denne enheten, så fortsetter Jobbhjelpen med profilen du nettopp startet.
                  </p>
                </div>
              </motion.div>
            )}
          </motion.form>
        </section>

        <aside className="border-t lg:border-t-0 lg:border-l border-border bg-muted/25 px-4 md:px-8 py-8 md:py-12 flex items-center">
          <motion.div
            className="w-full max-w-lg mx-auto space-y-5"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35, delay: 0.08 }}
          >
            <div>
              <div className="text-xs font-medium uppercase text-muted-foreground">Forhåndsvisning</div>
              <h2 className="text-2xl font-semibold mt-2">Dette blir første søk</h2>
            </div>

            <div className="rounded-lg border border-border bg-background p-4 space-y-4 shadow-sm">
              <div className="space-y-2">
                <div className="text-sm font-semibold flex items-center gap-2">
                  <Search className="w-4 h-4 text-primary" />
                  Søkeforslag
                </div>
                {searchTerms.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {searchTerms.map((term) => (
                      <Badge key={term} variant="secondary">{term}</Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Søkeord dukker opp mens du skriver.</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <PreviewTile label="Arbeidsplassen" value="Profilstyrt søk" />
                <PreviewTile label="Finn" value="RSS eller manuelt søk" />
                <PreviewTile label="LinkedIn" value={normalized.linkedinUrl ? "Brukes som hint" : "Valgfritt hint"} />
                <PreviewTile label="Resultat" value="Første matcher i onboarding" />
              </div>

              <div className="rounded-md bg-muted/60 p-3 text-sm">
                <div className="font-medium flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-primary" />
                  Rammer
                </div>
                <p className="text-muted-foreground mt-1 whitespace-pre-line">
                  {normalized.location || "Sted og arbeidsform blir brukt til å filtrere bort dårlige treff."}
                </p>
              </div>

              <div className="rounded-md bg-muted/60 p-3 text-sm">
                <div className="font-medium flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-primary" />
                  Styr unna
                </div>
                <p className="text-muted-foreground mt-1 whitespace-pre-line">
                  {normalized.dealbreakers || "Dealbreakers blir egne røde signaler i matchingen."}
                </p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Etter innlogging kan du legge til CV, importere offentlig LinkedIn-informasjon hvis tilgjengelig, og justere alt før første matching kjøres.
            </p>
          </motion.div>
        </aside>
      </main>
    </div>
  );
};

const PreviewTile = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-md border border-border bg-card p-3">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="text-sm font-medium mt-1">{value}</div>
  </div>
);

export default Start;
