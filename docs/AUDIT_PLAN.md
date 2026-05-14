# Søkly — Codebase audit + AI-kontrollplan

> Dato: 2026-05-11
> Eier: Brage
> Skal leses sammen med [STRATEGY.md](./STRATEGY.md), [BUSINESS_CASE.md](./BUSINESS_CASE.md) og [MARKET_ANALYSIS.md](./MARKET_ANALYSIS.md).

---

## Beste anbefaling (TL;DR)

Gjør auditen i fire spor som kan løpe parallelt, men med tydelig rekkefølge for det som er avhengig:

1. **Spor A — AI-kontrollag (kritisk, delvis implementert).** `supabase/functions/_shared/ai.ts` er nå ett kontaktpunkt for OpenAI, Anthropic/Claude og Lovable. `parse-job`, søknad, CV-tailoring, CV-redigering og CV-import er første migrerte bolk.
2. **Spor B — Funksjonsaudit mot strategi.** Sjekk hver edge function og hver side mot Søkly-bettene (match-transparens, norsk-modus, jobflow, privacy, anbefalinger).
3. **Spor C — Språk og kopi.** Konsolider alle UI-strenger og AI-prompts til norsk, sikre konsistent tone, legg grunnlag for norsk-modus-valg.
4. **Spor D — Prismodell og betalingsklar.** Ingen Stripe i dag. Forbered datamodell og feature-flagg, men selve betalingsflyten kommer i fase 3 (etter v1).

Ikke gjør "Lovable → én ny provider" som big-bang. Gjør det funksjon-for-funksjon bak feature flags, slik at vi kan kjøre A/B internt og rulle tilbake hvis output blir dårligere.

---

## 0. Hva vi vet om kodebasen nå

| Område | Status |
|---|---|
| Stack | Vite + React 18 + TypeScript + shadcn/ui + Tailwind + React Query + Supabase |
| Pakkebehandler | Bun |
| Edge Functions | 27 totalt; første brukernære AI-bolk er migrert til felles `runAi` |
| AI-provider | Provider-ruting via `AI_PROVIDER=auto | openai | anthropic | lovable` og per-feature overrides |
| Modell | OpenAI som standard for struktur/CV/parse, Claude som pilot for søknadsskriving, Lovable som rollback |
| Norsk språk | System-prompts er på norsk; UI-tekster i hovedsak norsk |
| Funksjonskall | Standard chat-completion; `_shared/full-match.ts` bruker tool-calling (function calling) |
| Pricing | **Ikke implementert** — ingen Stripe, ingen plan-tabell, ingen subscription-state |
| Trust/privacy | Ikke et synlig produktlag — kun standard Supabase RLS |
| Tester | 18 Vitest-filer inkl. AI control-plane adapter- og kvalitetsregler |
| ESLint | `--max-warnings=0` — null advarsler tillatt |

### Edge Functions med Lovable-avhengighet (19)

```
generate-application      tailor-cv                edit-tailored-cv
parse-job                 summarize-job            edit-application
import-cv                 extract-application-attachment
profile-onboarding-ai     pick-cv-style            apply-application-attachments
generate-plan             suggest-source-feeds     poll-rss
auto-search/enrich        enrich-jobs/enrich       _shared/full-match.ts
```

Ikke-AI edge functions (kan ignoreres for migrasjon):
`ingest-finn`, `ingest-arbeidsplassen-feed`, `match-user-jobs`, `match-anonymous`, `import-linkedin`.

---

## Spor A — AI-provider abstraksjon og kontrollag

### A1. Bygg `_shared/ai.ts` (1–2 dager)

**Mål:** Erstatte direkte `fetch()` til Lovable med ett funksjonskall som velger provider basert på env.

**Designkrav:**

- Provider-toggle via env: `AI_PROVIDER=openai | anthropic | lovable | auto`.
- Default = feature-basert: OpenAI for struktur/CV/parse, Anthropic for søknadsskriving, Lovable fallback.
- Modell-mapping via env: `AI_MODEL_FAST`, `AI_MODEL_BALANCED`, `AI_MODEL_DEEP`. Default:
  - fast: `gpt-5.4-mini` / `claude-haiku-4-5-20251001`
  - balanced: `gpt-5.4` / `claude-sonnet-4-6`
  - deep: `gpt-5.5` / `claude-opus-4-7`
- Funksjonskall normaliseres internt på tvers av OpenAI Responses API, Anthropic Messages API og Lovable Chat Completions.
- Returner alltid samme TS-type: `{ text?: string; toolCalls?: ToolCall[]; usage: { input: number; output: number; provider: string; model: string } }`.
- Logg usage til `ai_runs` og visninger `ai_usage_log` / `ai_usage_daily` for kostnadssporing.

**Filer som endres:**

```
supabase/functions/_shared/ai.ts        (NY)
supabase/functions/_shared/ai-types.ts  (NY)
```

**Skisse av API:**

```ts
import { runAi, type AiTool } from "../_shared/ai.ts";

const result = await runAi({
  system: "Du er en norsk AI-rekrutterer ...",
  user: prompt,
  tier: "balanced",                // fast | balanced | deep
  tools: [scoreMatchTool],
  toolChoice: { name: "score_job_match" },
  maxOutputTokens: 1500,
  // optional:
  userId: user.id,
  feature: "full_match",
});
```

### A2. Pilotmigrasjon: `parse-job` (1/2 dag)

**Hvorfor `parse-job` først:**

- Lavt risiko-fotavtrykk; brukes når en bruker limer inn en jobbannonse-URL.
- Tydelig input/output — lett å sammenligne kvalitet før/etter.
- Klassiker for tool-calling, så vi får testet hele abstraksjonen.

**Akseptkriterier:**

- Samme JSON-utdata som før (felt-for-felt).
- Manuell sjekk på 10 reelle annonser (Finn, Arbeidsplassen, Webcruiter).
- Latency ≤ 1,5x Lovable-baseline.
- Kostnad logget i `ai_usage_log`.

### A3. Migrér resten i prioritert rekkefølge

| Bolk | Funksjoner | Hvorfor i denne rekkefølgen |
|---|---|---|
| 1 — Match og forklaring | `_shared/full-match.ts`, `match-user-jobs`, `summarize-job` | Dette er Søklys signatur. Vi vil at Claude skal eie kvaliteten her. |
| 2 — Søknadsgenerering | `generate-application`, `edit-application` | Norsk skrivekvalitet er differensiator. Claude leverer sterkere norsk enn Gemini Flash. |
| 3 — CV-håndtering | `tailor-cv`, `edit-tailored-cv`, `pick-cv-style`, `import-cv`, `extract-application-attachment`, `apply-application-attachments` | Krever god struktur-følging. |
| 4 — Onboarding og plan | `profile-onboarding-ai`, `generate-plan` | Brukerorientert, krever varme. |
| 5 — Sourcing | `auto-search/enrich`, `enrich-jobs/enrich`, `suggest-source-feeds`, `poll-rss` | Mer "klassifisering enn tekst" — kan også bli på Haiku/Gemini for kost. |

### A4. Modellvalgsregel (lagt inn i `ai.ts`)

| Tier | Modell | Når |
|---|---|---|
| `fast` | Haiku 4.5 | Klassifisering, RSS-parsing, kort polish, lave-stakes prompts |
| `balanced` | Sonnet 4.6 | Match-scoring, søknadsgenerering, CV-tailoring, profil-onboarding |
| `deep` | Opus 4.6 | Bare ved kompleks reasoning — match-forklaring v2, særlig komplekse søknader. Brukes sparsomt p.g.a. kost. |

### A5. Kostnadskontroll og logging

**Hvorfor det er kritisk:** Claude er dyrere enn Gemini Flash. Du må vite forbruket per bruker og per feature før Pro-pris settes.

- Lag tabell `ai_usage_log(user_id, feature, provider, model, input_tokens, output_tokens, latency_ms, created_at)`.
- Daglig view: `ai_usage_daily` (gruppert per feature og dag).
- Sett kvoter i `ai.ts`:
  - Gratisbrukere: 3 søknader/mnd, 50 matches/mnd, 5 CV-tailorings/mnd.
  - Pro: ubegrenset, men cap på 200 søknader/mnd (mot misbruk).
- Når en kvote treffes: 429 fra edge function med tydelig norsk feilmelding for UI.

### A6. Feature flag og A/B internt

- Env-flagg `AI_PROVIDER` styrer alle funksjoner.
- Per-funksjon override: `AI_PROVIDER__FULL_MATCH=anthropic` osv. for å kunne migrere stykkevis.
- Du selv kjører `anthropic`, alle andre brukere fortsetter på Lovable de første ukene.

### A7. Rollback-plan

- Hvis kvalitet eller kost er ute av kontroll: sett `AI_PROVIDER=lovable` og restartet edge functions deployer på sekunder.
- All eksisterende Lovable-kode forblir i live-stien gjennom hele migrasjonen.

### Estimat for spor A

- A1 + A2 (abstraksjon + pilot): 2 dager
- A3 (resten av 18 funksjoner): 4–6 dager spread over 2 uker
- A4–A7 (logging, kvoter, flagg): 1–2 dager
- **Totalt: ca. 8–10 effektive dager**

---

## Spor B — Funksjonsaudit mot strategi

Gå gjennom hver "kapabilitet" i [STRATEGY.md](./STRATEGY.md) og merk hva som er på plass, hva som mangler.

### B1. Transparent Match Score

| Krav | Status | Hva som mangler |
|---|---|---|
| AI-score 0–100 | Finnes (`full-match.ts`) | OK |
| Sub-scores (fag/kultur/praktisk/entusiasme) | Finnes | OK |
| Match reasoning (strengths/concerns/evidence) | Finnes som JSON-felt | UI viser dette ujevnt — sjekk `Matches.tsx`, `JobDetail.tsx` |
| Krav-for-krav: "dekket / delvis / mangler" | **Mangler** | Trenger ny tool-output: array av `{ requirement, status, evidence_from_cv, evidence_from_ad }` |
| Hvor i CV-en så vi dette | **Mangler** | Krever at vi parser CV som strukturert objekt, ikke fritekst |
| Handlingsforslag per krav | Delvis | Recommendation finnes, men ikke per-krav |

**Konkret arbeid:** Utvid `score_job_match` tool-schema med `requirements: array`, oppdater `full-match.ts` prompten, lag ny komponent `MatchEvidenceCard.tsx`.

### B2. Norsk-modus for tailoring

| Krav | Status | Hva som mangler |
|---|---|---|
| Norsk system-prompt | Finnes overalt | OK |
| Valg: privat / offentlig / "uten søknadsbrev" | **Mangler** | Trenger UI-valg i søknadsflow + tre prompt-varianter |
| Offentlig sektor-tilpasning (Webcruiter/Jobbnorge-stil) | **Mangler** | Egen prompt + sjekkliste for offentlig sektor-CV-felt |
| CV-first / "uten brev"-modus | **Mangler** | Egen flyt: generer kort motivasjonstekst + tilpasset CV |
| Kvalitetsregler (lengde, formalia, vedlegg) | Delvis | System-prompten har regler, men ingen post-validering |

**Konkret arbeid:** Ny komponent `ApplicationModeSelector.tsx`, tre nye prompt-templates i `_shared/prompts/`, lag norsk språkvalidator (`_shared/no-quality-rules.ts`).

### B3. Jobflow OS

| Krav | Status | Hva som mangler |
|---|---|---|
| Pipeline-statuser | Finnes | OK |
| Tracker | Finnes (`Applications.tsx`) | Tradisjonell, ikke "neste handling"-fokusert |
| Frister | Delvis (`CalendarPage.tsx`) | Ikke koblet til konkrete neste-handlinger |
| Oppfølging etter sendt søknad | **Mangler** | Trenger automatisk reminder X dager etter sendt |
| Kilde-tagging i tracker | Delvis | Jobben har source, men ikke synlig i pipeline-view |
| Daily ritual / "hva skal jeg gjøre i dag" | Delvis (`dailyCoach.ts`) | Bra fundament, men trenger sterkere kobling til tracker |

**Konkret arbeid:** Følgeopp-reminder-trigger i `applications` ved status-endring til "sent", source-badge i `Applications.tsx`, utvid `dailyCoach.ts` med "follow-up due"-blokk.

### B4. Privacy som produktlag

| Krav | Status | Hva som mangler |
|---|---|---|
| RLS i Supabase | Finnes | OK (standard) |
| Slett kontoen | **Mangler** | Trenger edge function `delete-account` som cascade-sletter |
| Eksport alt data | **Mangler** | JSON-eksport av profile, cv_templates, jobs, applications |
| "Ikke til modelltrening"-toggle | **Mangler** | Ikke meningsfullt før vi har egen modell — men dokumenter at vi *ikke* trener på data |
| Audit log per bruker | **Mangler** | Hva ble eksportert/slettet/endret når |
| Synlig på dashboard | **Mangler** | Liten "datakontroll"-card i innstillinger, ikke gjemt |

**Konkret arbeid:** Egen `/innstillinger/personvern`-side, nye edge functions `delete-account` + `export-user-data`, audit_log-tabell.

### B5. Norske anbefalinger

| Krav | Status | Hva som mangler |
|---|---|---|
| Ingest Finn | Finnes | OK |
| Ingest Arbeidsplassen | Finnes | OK |
| Auto-search basert på profil | Delvis (`auto-search`) | OK fundament, men anbefalinger er ikke en egen flate |
| Recommendation-feed på dashboard | **Mangler** | Bør ligge i "today's actions" |
| Læring fra swipe/feedback | Finnes (`signals`-tabell) | OK |
| Region-/bransjefilter | Delvis | Sjekk hva `Sources.tsx` faktisk styrer |

**Konkret arbeid:** Ny "Anbefalt for deg"-blokk på dashboard, koble swipe-feedback inn i recommendation-scoring.

---

## Spor C — Språk og kopi

### C1. UI-strenger

- Søk etter gamle produktnavn og engelske reststrenger i `src/**/*.tsx`. Bruk "Søkly" visuelt og `sokly` teknisk.
- Liste over filer å gå gjennom:
  - `index.html` (title, meta)
  - `src/pages/Landing.tsx` (hero, value props)
  - `src/pages/Auth.tsx`, `AuthCallback.tsx`
  - `src/pages/Onboarding.tsx`, `Start.tsx`
  - `src/index.css` (kommentarer)
- Etabler i18n-løsning **først når vi internasjonaliserer** (ikke nå). I dag: hardkodet norsk er greit.

### C2. AI-prompts

- Konsolider system-prompts i `supabase/functions/_shared/prompts/` (ny mappe).
- Tre nivåer:
  - `system/recruiter.ts` — base for matching/scoring
  - `system/writer.ts` — base for søknadsgenerering
  - `system/parser.ts` — base for jobbparsing/CV-import
- Hver flow legger på `mode`-prefix (`private`, `public`, `cv_first`).

### C3. Tone- og kvalitetsregler

- Lag `_shared/no-quality-rules.ts` med:
  - Forbudte floskler: "jeg brenner for", "lidenskapelig opptatt av", "spennende mulighet", "dynamisk arbeidsmiljø" osv.
  - Lengdekrav per modus (privat: 250–400 ord; offentlig: 350–500; cv_first: 80–150).
  - Post-validering: kjør output gjennom regex/listsjekk før retur, og hvis dårlig, be modellen omskrive én gang.

### C4. Navnerebrand til Søkly

- Sjekk `søkly.no`, `sokly.no` på Norid + Brønnøysund + Patentstyret **først**.
- Når låst: én PR som bytter alle 14 forekomster + `package.json name`, `index.html title`, README, copilot-instructions.md, CLAUDE.md.
- Behold mappenavn `recruitbot-buddy` for nå (lavt risiko-fotavtrykk, kan rebrandes ved git-mv senere).

---

## Spor D — Prismodell og betalingsklar

**Status:** Ingen prising er implementert. Stripe finnes ikke i `package.json`. Ingen `plans`-tabell, ingen `subscriptions`.

### D1. Datamodell-fundament (kan gjøres uten Stripe)

```sql
-- Migrasjon: add_billing_baseline.sql
create table public.plans (
  id text primary key,           -- 'free' | 'pro' | 'pro_intro'
  name_no text not null,
  monthly_price_nok int not null,
  yearly_price_nok int,
  features jsonb not null        -- { max_applications, max_matches, ... }
);

alter table public.profiles
  add column plan_id text references public.plans(id) default 'free',
  add column plan_renews_at timestamptz,
  add column plan_canceled_at timestamptz;

create table public.feature_usage (
  user_id uuid references auth.users(id),
  feature text not null,
  period_start date not null,
  count int default 0,
  primary key (user_id, feature, period_start)
);
```

### D2. Feature flag i edge functions

- `_shared/billing.ts` med `getUserPlan(userId)` + `checkFeatureQuota(userId, feature)`.
- Bruk overalt der AI-call er dyr: `generate-application`, `tailor-cv`, `full-match`, `import-cv`.
- Returner 429 med norsk feilmelding hvis kvote er treffet.

### D3. UI: "Du er på gratis"-banner

- Liten plan-status i header (uobtrusiv).
- "Oppgrader"-card på dashboard hvis kvoten er ≥ 70 % brukt.
- Ingen aggressive popups.

### D4. Stripe-integrasjon (senere — fase 3)

- Når soft launch er live: integrer Stripe.
- Foretrekk Stripe Checkout + Customer Portal (minst kode).
- Edge function `stripe-webhook` oppdaterer `profiles.plan_id` ved subscription.created/updated/deleted.
- Trenger: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` env.

### D5. Hva vi ikke gjør nå

- Ingen Stripe-integrasjon i v1 (vi bygger først verdien Pro skal selge).
- Ingen credits/top-up — strategi-beslutning i [STRATEGY.md](./STRATEGY.md).
- Ingen team/enterprise-pakker.

---

## Tverrgående: Tester, CI, deploy

### Testing

- Hver migrert edge function bør få en "minimal test" i `src/test/` som validerer at output-strukturen matcher før/etter.
- Spesielt: `_shared/full-match.ts` har en fallback-funksjon; bygg deterministisk testcase.
- Snapshot-tester for søknadsgenerering er for sprøtt — bedre med kontrakt-tester (har felt X, lengde i intervall Y).

### CI

- `bun run lint` + `bun run test` skal kjøre på hver PR (forutsetning).
- Sjekk GitHub Actions-oppsett — finnes i `.github/`?

### Deploy

- Supabase edge functions deployes via Supabase CLI: `supabase functions deploy <name>`.
- Lag enkelt script `scripts/deploy-all-ai.sh` som deployer de 19 AI-funksjonene i ett sveip etter abstraksjonen er på plass.

---

## Rekkefølge og tidsestimat

| Uke | Hovedfokus | Konkret leveranse |
|---|---|---|
| 1 | Navnesjekk + AI-abstraksjon | Norid/BR/Patentstyret-svar + `_shared/ai.ts` klar |
| 2 | Pilot + match-migrasjon | `parse-job` + `full-match` på Claude; logging på plass |
| 3 | Søknad + CV-migrasjon | `generate-application`, `edit-application`, `tailor-cv` på Claude |
| 4 | Resten + kvalitetsregler | Onboarding/sourcing migrert; `no-quality-rules.ts` aktivert |
| 5 | Funksjonsaudit lukker hull | Match-evidence-card, applikasjonsmodus-velger, source-badge |
| 6 | Privacy som produktlag | `delete-account`, `export-user-data`, `/innstillinger/personvern` |
| 7 | Anbefalinger v1 + dashboard-polish | "Anbefalt for deg"-blokk, follow-up-reminders |
| 8 | Prismodell-fundament + rebrand | `plans`-tabell, kvotekontroll, Søkly i alle synlige flater |

Etter uke 8 er kjernen klar for intern soft launch. Stripe, public launch og partnerpilot følger i fase 3 ([BUSINESS_CASE.md](./BUSINESS_CASE.md)).

---

## Risikoregister (auditspecifikt)

| Risiko | Sannsynlighet | Konsekvens | Mitigering |
|---|---|---|---|
| Claude gir dårligere norsk enn Gemini i noen tilfeller | Lav–middels | Middels | A/B på samme prompt; behold Lovable som fallback per funksjon |
| Kostnaden løper løpsk under intern test | Middels | Høy | Kvoter fra dag 1; `ai_usage_log`-rapport sjekkes ukentlig |
| Tool-calling-format må re-skrives 19 ganger | Middels | Middels | Sentralisér tool-translasjon i `ai.ts`; ingen funksjon kjenner provider |
| Funksjonsregresjoner ikke fanget opp | Middels | Høy | Kontrakt-tester + intern dogfooding før hver migrert funksjon promoveres |
| Tokenkostnad på `full-match` særlig høy | Høy | Middels | Cache match-resultat per (jobId, cvVersion); ikke kjør på nytt uten endring |

---

## Konkrete neste steg (denne uken)

1. Reservér `søkly.no` og `sokly.no` på Norid (eller via en registrar).
2. Søk i Brønnøysund på "Søkly" og "Sokly" — er foretaksnavn ledig?
3. Sjekk Patentstyret-databasen for varemerke-konflikt.
4. Skaff `ANTHROPIC_API_KEY` og sett som Supabase secret: `supabase secrets set ANTHROPIC_API_KEY=...`.
5. Lag et nytt issue/PR for spor A1: "Build _shared/ai.ts provider abstraction".
6. Velg én testjob (URL fra Finn) som blir baseline for "før/etter parse-job"-sammenligning.

---

## Åpne spørsmål (svar hvis du har det klart)

1. **Holder vi `google/gemini-3-flash-preview` for noen funksjoner permanent** (kost-optimalisering for klassifisering), eller skal vi standardisere helt på Claude?
2. **Streaming**: skal `generate-application` streame til UI for opplevd-fart, eller er full-respons greit i v1?
3. **Selv-hosted modeller** for personvern (LLaMA på egen GPU)? — sannsynligvis nei før vi vet faktiske brukertall, men verdt å nevne i privacy-løftet.
4. **Edge function-cold starts**: vurder å holde de viktigste varme via cron-ping?
