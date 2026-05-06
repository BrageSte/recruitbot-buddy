
# Landingsside + "test meg"-flyt for Jobbhjelpen

## Problem

Idag lander besøkende rett inn i `/start` (en pre-onboarding skjema-side) eller `/auth`. Det finnes ingen offentlig side som forklarer:
- Hva produktet er
- Hvilket problem det løser (CV, søknader, annonser spredt over mange steder)
- Hvordan flyten fungerer (CV-opplasting → matcher → søknadsportal)

Vi trenger en ekte landingsside som selger produktet, og en lett "prøv det"-opplevelse før brukeren forplikter seg med e-post.

## Løsning – overordnet

Endre rotruting:
- `/` (uinnlogget) → ny **Landing**-side
- `/` (innlogget) → Dashboard som idag
- `/start` → beholdes som dypere skjema-inngang (CTA fra landing fortsetter dit)
- Ny `/demo` → "test meg"-flyt: lim inn CV-tekst eller velg eksempel-CV, se simulerte jobbmatcher med score, uten innlogging

## Landing-siden (`/` for uinnlogget)

Seksjoner, i rekkefølge:

### 1. Hero
- Overskrift: "Alt for jobbsøkingen din – på ett sted."
- Underoverskrift: forklarer at CV, søknader og annonser idag er spredt på mange flater. Jobbhjelpen samler det.
- Primær-CTA: "Prøv med din CV" → `/demo`
- Sekundær-CTA: "Logg inn" → `/auth`
- Visuelt: produkt-skjermbilde av Dashboard/Matches med score-badges (hentes via `browser--screenshot` av eksisterende sider, lagres i `public/screenshots/`)

### 2. Problemet ("Før Jobbhjelpen")
Tre kolonner med ikoner:
- "CV i Word, Google Docs, LinkedIn" – aldri oppdatert samme sted
- "Annonser på Finn, LinkedIn, Arbeidsplassen, NAV" – ingen oversikt
- "Søknadsbrev fra bunn hver gang" – tar timer, treffer dårlig

### 3. Løsningen ("Med Jobbhjelpen")
Tre matchende kolonner:
- Én CV som tilpasses hver søknad automatisk
- Alle annonser samlet med AI-score mot din profil
- Søknader skreddersys fra din ekte erfaring

### 4. Slik fungerer det (3-stegs flyt)
Visuell flyt med screenshots:
1. **Last opp CV / fortell om deg selv** → screenshot av CV-import / onboarding
2. **Få jobbmatcher med score** → screenshot av Matches med score-badges
3. **Generér tilpasset CV og søknad** → screenshot av Tilpasset CV / Application detail

### 5. Funksjoner (feature-grid)
- Auto-søk fra Arbeidsplassen, Finn, NAV, RSS
- AI-rekrutterer som forklarer hvorfor jobben matcher
- Tilpasset CV per søknad (PDF-eksport)
- Søknadsbrev-generator som bruker din ekte historie
- Kalender for frister, intervjuer, oppfølginger
- Pipeline: oppdaget → vurderer → utkast → sendt → svar → intervju

### 6. "Test meg" / Demo-CTA-banner
"Lim inn CVen din – se hvilke jobber som matcher – uten å lage konto."
Knapp → `/demo`

### 7. FAQ + sluttfooter
- Er det gratis å prøve?
- Hva skjer med dataen min?
- Hvilke jobbkilder støttes?
- Footer med lenke til logg inn / start.

## Demo-flyten (`/demo`) – "test meg" uten innlogging

Tre steg, alt klientside (ingen DB-skriv før innlogging):

### Steg 1: Velg utgangspunkt
- "Lim inn CV-tekst" (textarea)
- "Bruk eksempel-CV" (3 personas: produktleder, frontend-utvikler, kundesuksess)
- "Last opp PDF" (valgfritt – kan kalle eksisterende `import-cv` edge function anonymt; hvis det krever auth, gjøres dette kun via paste/eksempel i denne fasen)

### Steg 2: Kort målintervju (3 spørsmål)
- Hva slags rolle vil du ha?
- Hvor (sted/remote)?
- Dealbreakers?

### Steg 3: Resultat – "Dine matcher"
Viser 5-6 forhåndsvalgte ekte jobber (statisk seedet fra `public/demo-jobs.json`) sortert med score-badges (gjenbruk `<ScoreBadge />`). Score beregnes klientside fra enkel keyword-overlapp mellom CV-tekst og jobbtekst – nok til å demonstrere konseptet, ikke ekte AI.

Hver match viser:
- Tittel, firma, sted
- Score-badge
- 2-3 punkter "hvorfor matcher" (keyword-treff)
- Knapp "Lag søknad" → trigger innloggings-CTA: "Logg inn for å generere skreddersydd CV og søknad"

Bunn av siden: stor CTA "Lagre profilen og fortsett" → sender med via `savePreOnboardingDraft` til `/start` eller direkte `/auth`.

## Tekniske endringer

```text
src/App.tsx
  - / (uinnlogget) -> <Landing />
  - / (innlogget)  -> <Dashboard /> (gjennom AppLayout)
  - /demo          -> <Demo /> (offentlig)

src/pages/Landing.tsx     (NY)
src/pages/Demo.tsx        (NY)
src/components/landing/   (NY)
  Hero.tsx
  ProblemSolution.tsx
  HowItWorks.tsx
  FeatureGrid.tsx
  DemoBanner.tsx
  Faq.tsx
  Footer.tsx
src/components/demo/
  CvInputStep.tsx
  GoalsStep.tsx
  MatchesStep.tsx
  scoring.ts            (enkel keyword-score)
public/demo-jobs.json    (6 seedede jobber)
public/screenshots/      (3-5 PNG av appen)
```

Rotrute-logikk: enklere er å lage en ny `RootRoute`-komponent som leser `useAuth()` og rendrer `Landing` eller redirecter til Dashboard. Beholder eksisterende `ProtectedRoute` uendret.

## Designspråk
Bruker eksisterende Tailwind-tokens og ui-komponenter (`Button`, `Badge`, `Card`). Dark/light følger tema. Stil matcher dagens `Start.tsx` (motion fra framer-motion, badges, lette borders) for konsistens.

## Det dette IKKE inkluderer
- Ekte AI-scoring i demo (gjøres med keyword-overlapp; ekte AI etter innlogging)
- Ny PDF-eksport eller endringer i edge functions
- A/B-testing eller analytics

## Etter godkjenning
1. Generere screenshots fra eksisterende app via `browser--screenshot`.
2. Bygge `Landing.tsx` med seksjoner.
3. Bygge `Demo.tsx` med 3 steg + seed-jobber.
4. Endre `App.tsx` rot-rute.
5. Verifisere ingen regresjoner for innloggede brukere (de skal fortsatt lande på Dashboard).
