## Mål

Når AI tilpasser CV per søknad, skal resultatet bli en **ekte, strukturert CV-snapshot** koblet til søknaden — ikke bare markdown og løse anbefalinger. Snapshotet brukes i forhåndsvisningen ("CV samme stil"), eksporteres til PDF i samme stil som søknadsbrevet, og kan endres etterpå.

AI får nå også omstrukturere `section_order`, prioritere ferdigheter på toppen, fremheve/tone ned erfaringer og oppdatere intro — alt i én operasjon.

## Hva som endres

### 1. Database
Ny migrasjon: legg til kolonner på `application_cv_tweaks`:
- `tailored_cv jsonb` — strukturert CV-snapshot (samme form som `cv_templates`-feltene). Brukes til å rendre CvDocument og PDF.
- `section_order text[]` — AI-foreslått rekkefølge for snapshotet.

(Beholder `tailored_cv_markdown` for bakoverkompatibilitet, men den blir sekundær.)

### 2. `tailor-cv` edge function
- Henter CV-malen + jobb + profil som før.
- Tool-skjemaet utvides med `tailored_cv` (full struktur: intro, experiences, education, skills, languages, projects, certifications) og `section_order`.
- AI får eksplisitt instruks om å:
  - Beholde original-data sannferdig (ikke finne på), men tillate omformuleringer av `description`/`bullets` og rekkefølgen innen lister (f.eks. flytte mest relevant erfaring først).
  - Filtrere bort åpenbart irrelevante punkter når det styrker søknaden.
  - Sette `section_order` slik den passer best for jobben.
- Lagrer `tailored_cv` + `section_order` i `application_cv_tweaks`.

### 3. `ApplicationDetail.tsx` — bruke snapshotet
- "CV (samme stil)"-kortet i Søknadsbrev-tabben viser nå **tilpasset CV når den finnes**, ellers fallback til mal.
- Ny indikator over CV-en: "🪄 AI-tilpasset for denne stillingen — [Bruk original mal]".
- I CV-tabben:
  - Erstatt markdown-blokken med en **ekte forhåndsvisning** via `CvDocument` (samme stil og rekkefølge som søknadsbrevet).
  - "Generer på nytt"-knappen som før.
  - Ny knapp: "Bruk original mal igjen" (sletter snapshotet, beholder anbefalinger).

### 4. Eksport
PDF-eksport bruker nå snapshotet automatisk siden `CvDocument` får tilpasset data inn. Ingen separat kodeløype for "tilpasset PDF".

## Filer som berøres

- Ny migrasjon (kolonner på `application_cv_tweaks`)
- `supabase/functions/tailor-cv/index.ts` — utvidet tool-skjema og lagring
- `src/pages/ApplicationDetail.tsx` — bruk snapshot, ny preview i CV-tab, fallback-knapp
- `src/integrations/supabase/types.ts` (auto-regenereres etter migrasjon)

## UI-flyt

```text
Søknadsbrev-tab:
  [CV-variant: Tech]   ← grunnvalg
  [CV-stil: Skandinavisk]
  [Søknadsbrev …]
  [CV (samme stil) — 🪄 AI-tilpasset for stillingen]   ← snapshot brukes
  
CV-tab:
  [Generer på nytt]  [Bruk original mal igjen]
  AI-anbefalinger (intro, fremhev, ton ned, omformuleringer)
  [Forhåndsvisning av tilpasset CV — samme stil som brevet]
```
