# Søkly — Claude Code Instructions

Søkly er en norsk jobbsøker-portal der jobbsøkere styrer jobs, søknader, CV og kalender fra ett dashboard, drevet av Supabase + Edge Functions.

Full arkitektur: [.github/copilot-instructions.md](.github/copilot-instructions.md) · Produktvisjon: [docs/PROJECT_MEANING.md](docs/PROJECT_MEANING.md) · Prinsipper: [docs/PRODUCT_PRINCIPLES.md](docs/PRODUCT_PRINCIPLES.md)

---

## Språk

- **Snakk norsk med brukeren** når brukeren skriver norsk. Bytt til engelsk hvis brukeren gjør det.
- **UI-tekster, AI-prompts, e-post og søknader er norske som standard.** Ikke endre kopi til engelsk uten å bli bedt om det.
- Kode, kommentarer i kode, og commit-meldinger: engelsk. Variabel- og funksjonsnavn på engelsk.

---

## Hurtigkommandoer

```bash
bun dev            # Dev-server på http://localhost:8080
bun run test       # Kjør alle Vitest-tester (CI-modus)
bun run test:watch # Watch mode
bun run lint       # ESLint — `--max-warnings=0`, må være helt ren
bun run build      # Produksjonsbygg
```

Bruk **alltid Bun** — ikke npm eller yarn.

Etter endringer i `src/lib/` eller komponenter: kjør relevant test og `bun run lint` før oppgaven meldes ferdig.

---

## Beslutningsfilter for nye features

Før du legger til UI-flate eller logikk, still spørsmålet fra [docs/PRODUCT_PRINCIPLES.md](docs/PRODUCT_PRINCIPLES.md):

> **"Would this make tomorrow's job-search session clearer, faster, or calmer?"**

Hvis ikke: foreslå et enklere alternativ, eller spør brukeren før du implementerer.

Hovedreglene:
- Dashboard er arbeidsbenken — nye flater skal som hovedregel ikke konkurrere med den
- Én sannhetskilde slår mange dokumenter — ikke lag nye isolerte lagringssteder for karrieredata
- AI hjelper, brukeren bestemmer — ingen automatisk sending, ingen oppdiktet erfaring, ingen skjult usikkerhet

---

## Konvensjoner

- **Import-alias**: alltid `@/` for `src/`-imports (`import { supabase } from "@/integrations/supabase/client"`)
- **UI**: kun shadcn/ui + Tailwind. Design tokens i [src/index.css](src/index.css). Ikke introduser nye UI-biblioteker
- **State**: React Query for serverdata, React Context for auth, lokal state for UI-ephemeral
- **Types**: [src/integrations/supabase/types.ts](src/integrations/supabase/types.ts) er auto-generert — **aldri rediger manuelt**
- **Tester**: nye `src/lib/`-funksjoner skal ha tester i [src/test/](src/test/) (filnavn matcher modulen)

---

## Supabase-workflow

```ts
import { supabase } from "@/integrations/supabase/client"

// Spørring
const { data, error } = await supabase.from("jobs").select("*").eq("user_id", userId)

// Edge Function
const { data } = await supabase.functions.invoke("generate-application", { body: payload })
```

Edge Functions: `parse-job`, `generate-application`, `tailor-cv`, `import-cv`, `match-user-jobs`, `ingest-finn`, `ingest-arbeidsplassen-feed`. Delte hjelpere i [supabase/functions/_shared/](supabase/functions/_shared/).

---

## AI-guardrails (kritisk)

- Aldri **finne opp** erfaring utenfor brukerens faktiske CV ([src/lib/](src/lib/) + Edge Functions må respektere dette)
- Søknader sendes **aldri automatisk** — alltid eksplisitt brukergodkjenning
- Usikre matcher og risikoflagg skal **vises**, ikke skjules
- Skrivestil: konkret, varm, direkte — ikke generisk søknadsspråk
- Detaljer: [docs/AI_RECRUITER.md](docs/AI_RECRUITER.md)

---

## Vanlige fallgruver

- Aldri rediger `src/integrations/supabase/types.ts` manuelt — regenerer via Supabase CLI
- Bruk `@/`-alias, aldri relative stier på tvers av mapper
- CV-endringer trackes i `cv_templates` med revisjonshistorikk — ikke overskriv
- `/matches`-ruten er omdøpt til `/jobs` — bevar redirects
- Ikke legg til generiske statistikk-paneler uten en tilhørende handling

---

## Nøkkelfiler

| Hva | Fil |
|-----|-----|
| Routing | [src/App.tsx](src/App.tsx) |
| Auth-kontekst | [src/hooks/AuthProvider.tsx](src/hooks/AuthProvider.tsx) |
| Matching/scoring | [src/lib/fullMatch.ts](src/lib/fullMatch.ts) |
| Daily Coach | [src/lib/dailyCoach.ts](src/lib/dailyCoach.ts) |
| Filkart | [docs/REPO_MAP.md](docs/REPO_MAP.md) |
