import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Briefcase,
  CheckCircle2,
  FileText,
  Sparkles,
  Wand2,
  X,
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
        <nav className="flex items-center gap-1 sm:gap-2">
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
      <BeforeAfter />
      <HowItWorks />
      <Faq />
      <FinalCta />

      <footer className="border-t border-border/70 py-6 px-4 md:px-8 text-sm text-muted-foreground flex flex-col sm:flex-row items-center justify-between gap-3">
        <div>© {new Date().getFullYear()} Jobbhjelpen</div>
        <div className="flex gap-4">
          <Link to="/demo" className="hover:text-foreground">Test meg</Link>
          <Link to="/auth" className="hover:text-foreground">Logg inn</Link>
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
        <Badge variant="secondary" className="rounded-md">CV · jobbannonser · søknader – samlet</Badge>
        <h1 className="text-4xl md:text-6xl font-semibold tracking-tight leading-[1.02]">
          Jobbsøking på <span className="text-primary">ett sted</span>.
        </h1>
        <p className="text-base md:text-lg text-muted-foreground max-w-xl">
          Last opp CV-en din én gang. Jobbhjelpen henter relevante jobber fra Finn, NAV og Arbeidsplassen, scorer dem mot deg, og skriver tilpasset CV og søknad – per jobb.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button size="lg" asChild className="h-12">
            <Link to="/demo">
              <Wand2 className="w-4 h-4 mr-2" /> Prøv med din CV – uten konto
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild className="h-12">
            <Link to="/auth">
              Logg inn <ArrowRight className="w-4 h-4 ml-2" />
            </Link>
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Ingen kortinfo</span>
          <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Tar 2 minutter</span>
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

const BeforeAfter = () => {
  const before = [
    "CV i Word, på LinkedIn og i en gammel PDF",
    "Annonser spredt på Finn, NAV og Arbeidsplassen",
    "Hver søknad skrevet fra bunn – timer per stilling",
  ];
  const after = [
    "Én CV som tilpasses automatisk per jobb",
    "Én innboks med jobber, scoret mot din profil",
    "Søknadsbrev i din tone på minutter, ikke timer",
  ];
  return (
    <section className="px-4 md:px-8 lg:px-14 py-14 md:py-20 border-t border-border/70 bg-muted/20">
      <div className="max-w-5xl mx-auto">
        <div className="max-w-2xl mb-10">
          <div className="text-xs uppercase font-medium text-muted-foreground">Før og etter</div>
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mt-2">Slutt å hoppe mellom faner.</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-lg border border-border/70 bg-background p-6">
            <div className="text-sm font-medium text-rose-500 mb-4">I dag</div>
            <ul className="space-y-3">
              {before.map((b, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <X className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">{b}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-primary/30 bg-background p-6 shadow-sm shadow-primary/5">
            <div className="text-sm font-medium text-primary mb-4">Med Jobbhjelpen</div>
            <ul className="space-y-3">
              {after.map((a, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
};

const HowItWorks = () => {
  const steps = [
    {
      n: "01",
      t: "Last opp CV",
      d: "PDF, lim inn tekst, eller svar på fem spørsmål. Vi bygger en strukturert profil.",
      chips: ["PDF/Word", "LinkedIn-import", "Auto-strukturert"],
      mock: <MockCv />,
      flip: false,
    },
    {
      n: "02",
      t: "Få matchende jobber",
      d: "Annonser hentes inn fra flere kilder og scores mot deg. Du ser hvorfor – og hvorfor ikke.",
      chips: ["NAV/Arbeidsplassen auto", "FINN RSS", "AI-score med forklaring"],
      mock: <MockMatches />,
      flip: true,
    },
    {
      n: "03",
      t: "Skreddersy og send",
      d: "Tilpasset CV og søknadsbrev per jobb, og full oversikt over hva som er sendt.",
      chips: ["Skreddersydd CV", "Søknadsbrev i din tone", "Pipeline + frister"],
      mock: <MockPipeline />,
      flip: false,
    },
  ];
  return (
    <section id="hvordan" className="px-4 md:px-8 lg:px-14 py-16 md:py-24">
      <div className="max-w-6xl mx-auto">
        <div className="max-w-2xl mb-12">
          <div className="text-xs uppercase font-medium text-muted-foreground">Slik fungerer det</div>
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mt-2">Tre steg – fra rot til sendt søknad.</h2>
        </div>
        <div className="space-y-16">
          {steps.map((step, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.4 }}
              className={`grid grid-cols-1 lg:grid-cols-2 gap-8 items-center ${step.flip ? "lg:[&>*:first-child]:order-2" : ""}`}
            >
              <div className="space-y-4">
                <div className="text-xs font-mono text-primary">{step.n}</div>
                <h3 className="text-2xl md:text-3xl font-semibold tracking-tight">{step.t}</h3>
                <p className="text-muted-foreground">{step.d}</p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {step.chips.map((c, j) => (
                    <span key={j} className="text-xs px-2 py-1 rounded-md border border-border/70 bg-muted/40 text-muted-foreground inline-flex items-center gap-1.5">
                      <Sparkles className="w-3 h-3 text-primary" />
                      {c}
                    </span>
                  ))}
                </div>
              </div>
              <div>{step.mock}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

const Faq = () => (
  <section className="px-4 md:px-8 lg:px-14 py-14 md:py-20 bg-muted/20 border-t border-border/70">
    <div className="max-w-3xl mx-auto">
      <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mb-8">Vanlige spørsmål.</h2>
      <div className="space-y-4">
        {[
          { q: "Er det gratis å prøve?", a: "Ja. Test matchingen uten konto, og fortsett med innlogging når du vil ta det videre." },
          { q: "Hva skjer med dataen min?", a: "CV-en din ligger på din konto, og du kan slette alt når som helst. Vi selger ikke data videre." },
          { q: "Hvilke jobbkilder dekkes?", a: "Arbeidsplassen og NAV automatisk, FINN via RSS, samt manuelle URL-er fra LinkedIn og andre nettsider." },
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

const FinalCta = () => (
  <section className="px-4 md:px-8 lg:px-14 py-14 md:py-20 border-t border-border/70">
    <div className="max-w-4xl mx-auto rounded-2xl border border-border/70 bg-gradient-to-br from-primary/10 via-background to-background p-8 md:p-12 text-center space-y-4">
      <Badge variant="secondary" className="rounded-md">Test meg</Badge>
      <h2 className="text-3xl md:text-4xl font-semibold tracking-tight flex items-center justify-center gap-2">
        <FileText className="w-7 h-7 text-primary" />
        Lim inn CV-en din. Se matchene.
      </h2>
      <p className="text-muted-foreground max-w-2xl mx-auto">
        Ingen konto, ingen e-post. Du får en smakebit på hvordan Jobbhjelpen scorer deg mot ekte stillinger – på under to minutter.
      </p>
      <div className="pt-2">
        <Button size="lg" asChild className="h-12">
          <Link to="/demo"><Wand2 className="w-4 h-4 mr-2" /> Start demoen</Link>
        </Button>
      </div>
    </div>
  </section>
);

export default Landing;
