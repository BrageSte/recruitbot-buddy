## Mål

Støtte flere CV-varianter (f.eks. "Formell", "Uformell", "Design", "Akademisk") som brukeren kan navngi. Når man søker en jobb, kan man velge hvilken variant som brukes — eller la AI velge automatisk basert på stillingen.

## Endringer i UI / navigasjon

1. **Sidebar-meny**: Endre "CV-mal" → **"CV"** (`AppLayout.tsx`).
2. **CV-side (`/cv`)**: Bygges om fra én aktiv CV til en liste av CV-varianter.
   - Toppen viser en variant-velger (tabs eller dropdown) med alle CV-er + "+ Ny variant"-knapp.
   - Hver variant har et navn (f.eks. "Formell IT", "Uformell startup", "Akademisk"), beskrivelse (valgfri kort tekst), og en "standard"-markering.
   - Knapper: Gi nytt navn, dupliser, slett, sett som standard.
   - Resten av redigeringsskjemaet jobber mot valgt variant.
3. **Onboarding**: Fortsetter å lage én "standard" CV merket som default — ingen synlig endring der.
4. **Jobbdetalj (`/jobs/:id`)**: Før AI genererer søknad, vis en liten dialog/velger:
   - "Hvilken CV vil du bruke?" — liste av varianter, med "🪄 La AI velge" som default-alternativ.
   - Valget sendes med til `generate-application`.
5. **Søknadsdetalj (`/applications/:id`)**: Vis hvilken CV-variant som ble brukt. La brukeren bytte CV-variant i ettertid (oppdaterer både hvilken CV som vises og styles).

## Datamodell

CV-er ligger allerede i `cv_templates`. Vi gjør den om fra "én aktiv per bruker" til "mange varianter per bruker":

- Nye kolonner på `cv_templates`:
  - `variant_name text not null default 'Standard'` — vist navn på varianten.
  - `variant_description text` — kort hint, brukes også av AI for å velge.
  - `is_default boolean not null default false` — markerer standardvarianten.
- Beholder `is_active` (true for alle nye varianter) for bakoverkompatibilitet, men logikken slutter å avhenge av "kun én aktiv".
- Migrasjon: For hver bruker som har en CV med `is_active=true`, sett `is_default=true` og `variant_name='Standard'`. Sett `is_active=true` på alle.
- På `applications`: legg til `cv_template_id uuid` (nullable) — peker til hvilken CV-variant som ble brukt for denne søknaden. Eksisterende søknader forblir null (faller tilbake til standard CV ved visning).

## Endringer i edge functions

- **`generate-application`**:
  - Aksepter ny body-param `cvTemplateId` (valgfri) og `letAiPick` (valgfri).
  - Hvis `cvTemplateId` gitt: bruk den CV-en direkte.
  - Hvis `letAiPick=true` (eller ingen valgt): hent alle brukerens CV-er, send navn + beskrivelse + `cv_style` til AI, la AI velge variant som passer best for stillingen (samme tool-call-mønster som dagens style-pick).
  - Ellers: bruk default CV (`is_default=true`).
  - Lagre `cv_template_id` og `cv_style` på den nye `applications`-raden.
- **Andre funksjoner** (`tailor-cv`, `match-user-jobs`, `poll-rss`, `suggest-source-feeds`, `ApplicationDetail.tsx`-lasting): bytt fra `is_active=true` til **default-CV** (`is_default=true`) som fallback, eller den spesifikke `cv_template_id` der det er relevant.

## Tekniske detaljer

- Onboarding (`Onboarding.tsx`) fortsetter å oppsette én CV; gi den `variant_name='Standard'`, `is_default=true`. Fjern logikken som slår av `is_active` på andre rader.
- Default-håndtering: Når en CV settes som default, sett `is_default=false` på alle andre CV-er for samme bruker (gjøres i to steg fra klient).
- Sletting: Kan ikke slette siste gjenværende CV. Hvis default slettes mens andre finnes, sett en av de andre til default automatisk.
- AI-pick prompt får liste av varianter slik:
  ```
  VARIANTER:
  - id: <uuid>, navn: "Formell IT", beskrivelse: "...", stil: korporat
  - id: <uuid>, navn: "Uformell startup", beskrivelse: "...", stil: startup
  ```
  AI returnerer chosen `cv_template_id`. Funksjonen slår opp på eier for å sikre tilhørighet.
- TypeScript-types regenereres automatisk fra Supabase etter migrasjon.

## Filer som endres

- `supabase/migrations/<ny>.sql` — kolonner + backfill.
- `src/components/AppLayout.tsx` — meny-label.
- `src/pages/CvTemplate.tsx` — full omskriving til multi-variant.
- `src/pages/Onboarding.tsx` — bruk `is_default` i stedet for `is_active`-toggling.
- `src/pages/JobDetail.tsx` — CV-velger-dialog før generering.
- `src/pages/ApplicationDetail.tsx` — vis brukt CV-variant + bytt-mulighet.
- `supabase/functions/generate-application/index.ts` — aksepter cvTemplateId / AI-pick av variant.
- `supabase/functions/tailor-cv/index.ts`, `match-user-jobs/index.ts`, `poll-rss/index.ts`, `suggest-source-feeds/index.ts` — bruk `is_default=true` (med fallback til første CV) i stedet for `is_active=true`.
