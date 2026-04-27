## Problem

Når man trykker «Tilpass CV» på en søknad, blir hele siden plutselig blank. Det er ingen feilmelding i UI — bare hvit skjerm.

## Årsak

Jeg sjekket databasen og fant rotårsaken. De to lagrede `tailored_cv`-snapshottene ser slik ut:

```json
{
  "skills":      [{}],
  "languages":   [{}],
  "experiences": [{}]
}
```

AI-en (Gemini, via `tailor-cv`) returnerer **tomme objekter** i listene fordi schemaet i edge-funksjonen er for løst (`additionalProperties: true` uten `required`-felter). Modellen «oppfyller» schemaet ved å sende `[{}]`.

I `tailor-cv/index.ts` gjøres så:
```ts
const tailoredCv = { ...baseSnapshot, ...parsed.tailored_cv };
```
Det betyr at den **overskriver** brukerens ekte `skills`/`languages`/`experiences` med søppel-arrayer.

I `CvDocument.tsx` rendres dette uten beskyttelse:
```ts
groups.map(g => g.items.join(" · "))   // g.items er undefined → kast
cv.languages.map(l => `${l.name} (${l.level})`)  // "undefined (undefined)"
```

`g.items.join` på `undefined` kaster en exception **midt i render**. Siden det ikke finnes noen `ErrorBoundary` i appen, river feilen ned hele React-treet → blank side.

Det forklarer også hvorfor det skjer «plutselig»: så snart `effectiveCv` byttes til snapshotet etter at AI er ferdig, krasjer rendringen.

## Løsning (tre lag, alle trengs)

### 1. Stopp AI-en fra å produsere søppel — `supabase/functions/tailor-cv/index.ts`
- Stram inn schemaet: kreve `category` + `items: string[]` for skills, `name` + `level` for languages, `title` + `company` for experiences osv.
- Endre system-prompten: AI skal bare returnere et avsnitt hvis det faktisk har innhold som matcher original-strukturen. Tomme arrayer er ikke lov.
- Etter parsing: validere AI-output og **filtrere bort** elementer som ikke har de obligatoriske feltene før vi merger.
- Endre merge-strategi: kun overskriv et felt på `baseSnapshot` hvis AI-feltet er en non-tom array med gyldige elementer (eller en non-tom string for `intro`/`headline`). Ellers behold originalen.

### 2. Defensiv rendering — `src/components/cv/CvDocument.tsx`
Selv om backend er fikset, må fronten aldri krasje hele appen pga. dårlig data:
- `SkillsBlock`: bruke `g.items ?? []` og hopp over grupper uten `category`.
- `Languages`: filtrer ut entries uten `name`.
- `Experience`: defaulte `e.title`/`e.company` til tomme strenger; hopp over helt tomme entries.
- `Education`/`Projects`/`Certifications`: tilsvarende guards.
- `renderSections`: hopp over en seksjon hvis listen — etter filtrering — er tom.

### 3. Global ErrorBoundary — ny `src/components/ErrorBoundary.tsx`
Wrappe `<Routes>` i `App.tsx` slik at en eventuell fremtidig render-feil viser en pen feilmelding med «Last på nytt»-knapp i stedet for blank skjerm. Dette er en billig forsikring som forhindrer hele kategorien «hvit side ved render-feil».

### 4. Rydd opp eksisterende ødelagte snapshots
De to radene i `application_cv_tweaks` med tomme `[{}]`-arrayer vil fortsatt vise feil layout (men ikke krasje, etter punkt 2). Migrasjon som setter `tailored_cv = NULL`, `section_order = NULL` der `tailored_cv->'skills' @> '[{}]'::jsonb` (eller tilsvarende heuristikk for korrupte rader). Da faller UI tilbake til original CV-mal, og brukeren kan generere på nytt med den fiksede edge-funksjonen.

## Filer som endres

- `supabase/functions/tailor-cv/index.ts` — strammere schema + post-validering + safe merge
- `src/components/cv/CvDocument.tsx` — guards i alle render-helpere
- `src/components/ErrorBoundary.tsx` — ny
- `src/App.tsx` — wrappe routes i ErrorBoundary
- ny migrasjon — nullstille korrupte snapshots

## Hva brukeren vil merke

- «Tilpass CV» krasjer ikke lenger siden, uansett hva AI returnerer.
- Hvis AI én gang returnerer noe rart, får man enten en gyldig (men kanskje litt mindre tilpasset) CV, eller en tydelig feilmelding — aldri blank skjerm.
- Eksisterende ødelagte tilpasninger nullstilles automatisk; man kan trykke «Generer på nytt» for å få en ny, gyldig versjon.

(Note: brukeren ba om Opus 4.7 — det er ikke en modell jeg kan bytte til på min side; jeg kjører som Lovable-agenten. Men planen over er den samme uavhengig av modellvalg.)
