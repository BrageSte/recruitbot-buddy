import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Briefcase,
  CalendarClock,
  CheckCircle2,
  FileText,
  Layers,
  Search,
  Sparkles,
  Target,
  Wand2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MockMatches, MockCv, MockPipeline } from "@/components/landing/MockApp";

const Landing = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="px-4 md:px-8 h-16 flex items-center justify-between border-b border-border/70 sticky top-0 bg-background/85 backdrop-blur z-30">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
            <Briefcase className="w-4 h-4" />
          </div>
          <div className="font-semibold">Jobbhjelpen</div>
        </Link>
        <nav className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <a href="#hvordan">Hvordan</a>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/auth">Logg inn</Link>
          </Button>
          <Button size="sm" asChild>
            <Link to="/demo">Prøv med din CV</Link>
          </Button>
        </nav>
      </header>

      <Hero />
      <Problem />
      <Solution />
      <HowItWorks />
      <Features />
      <DemoBanner />
      <Faq />

      <footer className="border-t border-border/70 py-8 px-4 md:px-8 text-sm text-muted-foreground flex flex-col sm:flex-row items-center justify-between gap-3">
        <div>© {new Date().getFullYear()} Jobbhjelpen</div>
        <div className="flex gap-4">
          <Link to="/auth" className="hover:text-foreground">Logg inn</Link>
          <Link to="/demo" className="hover:text-foreground">Test meg</Link>
          <Link to="/start" className="hover:text-foreground">Kom i gang</Link>
        </div>
      </footer>
    </div>
  );
};

const Hero = () => (
  <section className="px-4 md:px-8 lg:px-14 py-12 md:py-20">
    <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-10 lg:gap-14 items-center">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-6"
      >
        <Badge variant="secondary" className="rounded-md">CV, søknader og jobbannonser – samlet</Badge>
        <h1 className="text-4xl md:text-6xl font-semibold tracking-tight leading-[1.02]">
          Alt for jobbsøkingen din – på <span className="text-primary">ett sted</span>.
        </h1>
        <p className="text-base md:text-lg text-muted-foreground max-w-xl">
          CV i Word, annonser på Finn og LinkedIn, søknadsbrev fra bunn hver gang. Jobbhjelpen samler alt – og hjelper deg å skrive bedre søknader basert på den du faktisk er.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button size="lg" asChild className="h-12">
            <Link to="/demo">
              <Wand2 className="w-4 h-4 mr-2" /> Prøv med din CV – uten konto
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild className="h-12">
            <Link to="/start">
              Kom i gang <ArrowRight className="w-4 h-4 ml-2" />
            </Link>
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Ingen kortinfo</span>
          <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Annonser fra Finn, LinkedIn, NAV, Arbeidsplassen</span>
          <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Eksport til PDF</span>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="relative"
      >
        <div className="absolute -inset-6 bg-gradient-to-br from-primary/15 via-transparent to-transparent rounded-3xl blur-2xl" />
        <div className="relative">
          <MockMatches />
        </div>
      </motion.div>
    </div>
  </section>
);

const Problem = () => (
  <section className="px-4 md:px-8 lg:px-14 py-14 md:py-20 border-t border-border/70 bg-muted/20">
    <div className="max-w-6xl mx-auto">
      <div className="max-w-2xl mb-10">
        <div className="text-xs uppercase font-medium text-muted-foreground">Problemet</div>
        <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mt-2">Jobbsøking er kaos – på mange flater samtidig.</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          {
            t: "CV på fem steder",
            d: "Word, Google Docs, LinkedIn, gammel PDF. Ingenting er oppdatert samme sted.",
            i: FileText,
          },
          {
            t: "Annonser overalt",
            d: "Finn, LinkedIn, NAV, Arbeidsplassen, Slack-grupper. Ingen oversikt over hva du har sett.",
            i: Search,
          },
          {
            t: "Søknader fra bunn",
            d: "Hver søknad tar timer. Du skreddersyr lite, og treffer dårligere enn du burde.",
            i: Layers,
          },
        ].map((x, i) => (
          <div key={i} className="rounded-lg border border-border/70 bg-background p-5">
            <x.i className="w-5 h-5 text-rose-500 mb-3" />
            <div className="font-semibold">{x.t}</div>
            <p className="text-sm text-muted-foreground mt-1">{x.d}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

const Solution = () => (
  <section className="px-4 md:px-8 lg:px-14 py-14 md:py-20">
    <div className="max-w-6xl mx-auto">
      <div className="max-w-2xl mb-10">
        <div className="text-xs uppercase font-medium text-muted-foreground">Løsningen</div>
        <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mt-2">Én arbeidsbenk for hele jobbsøkingen.</h2>
        <p className="text-muted-foreground mt-3">Jobbhjelpen henter annonser fra flere kilder, scorer dem mot din profil, og skriver tilpasset CV og søknad fra din ekte erfaring.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { t: "Én CV som tilpasses", d: "Last opp én gang. Vi tilpasser den til hver jobb og eksporterer ren PDF.", i: FileText },
          { t: "Matcher med score", d: "AI-rekrutterer forklarer hvorfor jobben passer, og hva du bør fremheve.", i: Sparkles },
          { t: "Søknader på minutter", d: "Brev som faktisk høres ut som deg – ikke et generisk AI-utkast.", i: Wand2 },
        ].map((x, i) => (
          <div key={i} className="rounded-lg border border-border/70 bg-background p-5">
            <x.i className="w-5 h-5 text-primary mb-3" />
            <div className="font-semibold">{x.t}</div>
            <p className="text-sm text-muted-foreground mt-1">{x.d}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

const HowItWorks = () => (
  <section id="hvordan" className="px-4 md:px-8 lg:px-14 py-16 md:py-24 border-t border-border/70 bg-muted/20">
    <div className="max-w-6xl mx-auto">
      <div className="max-w-2xl mb-12">
        <div className="text-xs uppercase font-medium text-muted-foreground">Slik fungerer det</div>
        <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mt-2">Tre steg fra rot til tilbud.</h2>
      </div>
      <div className="space-y-16">
        {[
          {
            n: "01",
            t: "Last opp CV eller fortell kort om deg",
            d: "PDF, paste, eller svar på 5 spørsmål. Jobbhjelpen lager en strukturert profil du eier.",
            mock: <MockCv />,
            flip: false,
          },
          {
            n: "02",
            t: "Få jobbmatcher med score",
            d: "Vi henter annonser fra Finn, LinkedIn, NAV og Arbeidsplassen, og scorer dem mot deg. Du ser hvorfor de passer – eller ikke.",
            mock: <MockMatches />,
            flip: true,
          },
          {
            n: "03",
            t: "Generer skreddersydd CV og søknad",
            d: "Tilpasset CV per jobb, søknadsbrev som høres ut som deg, og oversikt over hva som er sendt og hva som venter.",
            mock: <MockPipeline />,
            flip: false,
          },
        ].map((step, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.4 }}
            className={`grid grid-cols-1 lg:grid-cols-2 gap-8 items-center ${step.flip ? "lg:[&>*:first-child]:order-2" : ""}`}
          >
            <div className="space-y-3">
              <div className="text-xs font-mono text-primary">{step.n}</div>
              <h3 className="text-2xl md:text-3xl font-semibold tracking-tight">{step.t}</h3>
              <p className="text-muted-foreground">{step.d}</p>
            </div>
            <div>{step.mock}</div>
          </motion.div>
        ))}
      </div>
    </div>
  </section>
);

const Features = () => (
  <section className="px-4 md:px-8 lg:px-14 py-14 md:py-20">
    <div className="max-w-6xl mx-auto">
      <div className="max-w-2xl mb-10">
        <div className="text-xs uppercase font-medium text-muted-foreground">Funksjoner</div>
        <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mt-2">Det du faktisk trenger.</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { t: "Auto-søk fra flere kilder", d: "Arbeidsplassen, Finn, NAV og RSS, samlet ett sted.", i: Search },
          { t: "AI-rekrutterer", d: "Forklarer hvorfor en jobb matcher – og hva du bør fremheve.", i: Sparkles },
          { t: "Tilpasset CV per søknad", d: "Strukturert mal, ren PDF, ingenting kuttet midt i tekst.", i: FileText },
          { t: "Søknadsbrev fra din historie", d: "Brev som låner ord fra din ekte erfaring, ikke generisk AI.", i: Wand2 },
          { t: "Kalender og oppfølging", d: "Frister, intervjuer og påminnelser om å følge opp.", i: CalendarClock },
          { t: "Pipeline", d: "Oppdaget → utkast → sendt → svar → intervju – på én linje.", i: Target },
        ].map((f, i) => (
          <div key={i} className="rounded-lg border border-border/70 p-5 bg-background">
            <f.i className="w-5 h-5 text-primary mb-3" />
            <div className="font-semibold">{f.t}</div>
            <p className="text-sm text-muted-foreground mt-1">{f.d}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

const DemoBanner = () => (
  <section className="px-4 md:px-8 lg:px-14 py-14 md:py-20 border-t border-border/70">
    <div className="max-w-5xl mx-auto rounded-2xl border border-border/70 bg-gradient-to-br from-primary/10 via-background to-background p-8 md:p-12 text-center space-y-4">
      <Badge variant="secondary" className="rounded-md">Test meg</Badge>
      <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">Lim inn CVen din – se matchene.</h2>
      <p className="text-muted-foreground max-w-2xl mx-auto">
        Ingen konto, ingen e-post. Du får en smakebit på hvordan Jobbhjelpen scorer deg mot ekte stillinger.
      </p>
      <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
        <Button size="lg" asChild className="h-12">
          <Link to="/demo"><Wand2 className="w-4 h-4 mr-2" /> Start demoen</Link>
        </Button>
        <Button size="lg" variant="outline" asChild className="h-12">
          <Link to="/start">Hopp rett til oppsett</Link>
        </Button>
      </div>
    </div>
  </section>
);

const Faq = () => (
  <section className="px-4 md:px-8 lg:px-14 py-14 md:py-20 bg-muted/20 border-t border-border/70">
    <div className="max-w-3xl mx-auto">
      <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mb-8">Spørsmål du sikkert har.</h2>
      <div className="space-y-4">
        {[
          { q: "Er det gratis å prøve?", a: "Ja. Du kan teste matchingen uten konto, og fortsette med innlogging når du vil ta det videre." },
          { q: "Hva skjer med dataen min?", a: "CV-en din ligger på din konto, og du kan slette alt når som helst. Vi selger ikke data videre." },
          { q: "Hvilke jobbkilder støttes?", a: "Arbeidsplassen, Finn (RSS/manuelt), NAV og LinkedIn (med manuelle fallback). Du kan også lime inn URL-er selv." },
          { q: "Skriver AI hele søknaden for meg?", a: "Nei. Den lager utkast basert på din ekte erfaring. Du redigerer videre og bestemmer tonen før du sender." },
        ].map((f, i) => (
          <div key={i} className="rounded-lg border border-border/70 bg-background p-5">
            <div className="font-semibold">{f.q}</div>
            <p className="text-sm text-muted-foreground mt-1">{f.a}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default Landing;
