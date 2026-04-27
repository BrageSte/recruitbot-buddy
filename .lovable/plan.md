## Mål

Gjør det enkelt å endre rekkefølgen på CV-avsnittene (Erfaring, Utdanning, Ferdigheter, Språk, Prosjekter, Sertifikater) — både i redigeringen og i den eksporterte/forhåndsviste CV-en. Du kan f.eks. dra Utdanning over Erfaring for en akademisk variant.

Rekkefølgen lagres per CV-variant, så ulike varianter kan ha ulik struktur.

## Hva som endres

### 1. Database
Ny migrasjon: legg til kolonne `section_order text[]` på `cv_templates`.
- Default: `['experiences','education','skills','languages','projects','certifications']`
- Lagres per variant.

### 2. CV-redigering (`src/pages/CvTemplate.tsx`)
- Nytt kort øverst: **"Rekkefølge på avsnitt"** med en enkel liste:
  - Hver rad viser avsnittets navn (Erfaring, Utdanning …) med en grip-ikon og opp/ned-piler.
  - Drag-and-drop med HTML5 native (samme mønster brukt allerede i `SectionList`).
  - Endringer oppdaterer `cv.section_order` og lagres med "Lagre"-knappen.
- Selve seksjonene under rendres dynamisk i den valgte rekkefølgen (én `renderSection(key)`-funksjon i stedet for hardkodet rekkefølge).
- "Tilbakestill rekkefølge"-knapp som setter default.

### 3. Forhåndsvisning og PDF (`src/components/cv/CvDocument.tsx`)
- `CvData`-typen får valgfri `section_order?: string[]`.
- Alle 5 layouts (Minimal, HeaderBand, Centered, Sidebar, Split) bruker en felles helper `renderSections(cv, style, order)` for hovedkolonnen, så avsnittene følger brukerens rekkefølge.
- Sidebar/Split: kun "main"-kolonnens avsnitt påvirkes (Erfaring, Utdanning, Prosjekter, Sertifikater). Sidebaren beholder sin faste struktur (kontakt + skills + språk), siden den er en del av layoutdesignet.

### 4. Typer
- Oppdater `src/integrations/supabase/types.ts` (auto-generert — ikke manuelt redigert; backend-migrasjon trigger regenerering).
- Lokal `CV`-type i `CvTemplate.tsx` får `section_order: string[]`.

## UI-skisse

```text
┌─ Rekkefølge på avsnitt ────────────────┐
│ ⋮⋮ Erfaring          ▲ ▼              │
│ ⋮⋮ Utdanning         ▲ ▼              │
│ ⋮⋮ Ferdigheter       ▲ ▼              │
│ ⋮⋮ Språk             ▲ ▼              │
│ ⋮⋮ Prosjekter        ▲ ▼              │
│ ⋮⋮ Sertifikater      ▲ ▼              │
│              [Tilbakestill rekkefølge] │
└────────────────────────────────────────┘
```

## Filer som berøres

- `supabase/migrations/<ny>.sql` (ny)
- `src/pages/CvTemplate.tsx`
- `src/components/cv/CvDocument.tsx`
- `src/integrations/supabase/types.ts` (auto)
