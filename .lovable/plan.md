
# JobHunter AI – plan

En AI-drevet jobbsøkerportal som erstatter mappestrukturen din med et visuelt dashboard. Bygges først for deg, men med "demo-modus" så andre kan teste – grunnlag for produkt senere.

## Kjerneidé

I stedet for `soknader/aktive/...`-mapper får du:
- Et **dashboard** som viser pipeline-status visuelt
- En **profil** (master-profile + CV + stil) som AI bruker for alt
- En **jobb-inbox** der nye jobber kommer inn (RSS, manuelt, lenker, fil-opplastning)
- AI som **scorer, oppsummerer og foreslår handlinger** automatisk
- En **kalender** med ukes-/månedsmål og påminnelser

## Sider og funksjoner

### 1. Dashboard (forsiden)
KPI-kort øverst:
- Søkte jobber (totalt + denne uken)
- Aktive søknader (venter på svar)
- Nye matcher (uleste, scoret høyt)
- Intervjuer planlagt
- Ukesmål-progresjon (f.eks. "3 / 5 søknader denne uken")

Under:
- **Pipeline-visualisering** (kanban-stil): Oppdaget → Vurderer → Søkt → Intervju → Tilbud / Avslag
- **Neste handlinger** (AI-foreslått): "Følg opp Tomra (sendt for 7 dager siden)", "Forbered intervju med Swix på fredag"
- **Aktivitetsgraf**: søknader sendt over tid

### 2. Jobber (inbox + søk)
- Liste over alle jobber, filtrerbar på status, match-score, kilde, frist
- Hver jobb-kort viser: tittel, selskap, match-score (farget badge), frist, kilde, AI-oppsummering (1 linje), risk-flags
- Klikk åpner detalj: full stillingstekst, AI-analyse (fag/kultur/praktisk/entusiasme score), "Generer søknad"-knapp, notater, status-endring
- **Legge til jobb** via:
  - Lim inn URL (finn.no, LinkedIn, andre) → AI parser
  - Lim inn ren tekst → AI parser
  - Manuelt skjema

### 3. Søknader
- Alle søknader med status (utkast, sendt, svar mottatt, avslag, tilbud)
- Detaljside per søknad: generert tekst (redigerbar), tilpasset CV-notater, dato sendt, oppfølgings-tidslinje
- "Generer søknad"-flyt: AI bruker master-profil + stil-guide + stillingsteksten

### 4. Profil (kilden til alt)
- **Master-profil**: redigerbar markdown (kjernehistorier, styrker, preferanser)
- **CV-opplasting**: PDF lastes opp, AI ekstraherer nøkkelinfo
- **Stil-guide**: tone, struktur, do/don't
- **Tidligere søknader**: opplastede filer som AI bruker som referanse for stil
- **LinkedIn**: lim inn profil-URL eller eksportert tekst (LinkedIn API er låst, så manuell input)
- **Søkekriterier**: vekting (fag 40 / kultur 20 / praktisk 20 / entusiasme 20), grønn/gul/rød-regler

### 5. Kilder (autosøk)
- Liste over RSS-feeds (finn.no lagrede søk)
- Legg til/fjern feed, gi navn
- "Sjekk nå"-knapp + automatisk polling
- Nye treff scores mot profilen og havner i Jobber-inbox

### 6. Kalender & mål
- Uke- og månedsvisning
- **Mål**: f.eks. "minst 5 søknader per uke", "ring 2 selskaper innen fredag"
- Hendelser: deadlines (jobbfrister), oppfølginger (AI foreslår "ring/mas innen X dager"), intervjuer
- Visuell progresjon: ringer/baren som fylles
- "Innen X dager"-visning på dashboardet

### 7. Demo-modus
- Toggle på toppen: "Bytt til demo"
- Laster en ferdig demo-bruker med eksempel-jobber, søknader, profil
- Endringer i demo lagres ikke (eller resettes daglig)
- Lar andre teste produktet uten å påvirke dine data

## Teknisk tilnærming (kort)

- **Lovable Cloud** (Supabase) for database, auth (epost) og fil-storage
- **Lovable AI Gateway** for all AI (match-scoring, oppsummering, søknadsgenerering, neste-handling-forslag) – default Gemini, kan bytte til GPT-5 for vanskelig søknadsskriving
- **Edge functions** for: RSS-polling, URL-parsing av stillinger, AI-kall
- **Tabeller**: `profiles`, `jobs`, `applications`, `application_events`, `rss_feeds`, `goals`, `calendar_events`, `uploaded_files` – alle med RLS
- **Roller**: `user_roles`-tabell (eier, demo) – demo-bruker har read-mostly tilgang
- Markdown-rendering med `react-markdown` for søknader og profil
- Kalender med `react-day-picker` (allerede i stack)

## Hva vi bygger først (fase 1)

For å komme raskt i gang og se verdi:

1. Auth + tom database-struktur
2. Profil-side (master-profil + CV-opplasting + stil-guide)
3. Jobber: legg til via URL/tekst, AI parser og scorer mot profil
4. Dashboard med pipeline + KPI-er
5. Søknadsgenerering (AI bruker profil + stil + jobb)
6. Status-tracking gjennom pipeline

## Fase 2 (etter at fase 1 funker)

- RSS-feed polling (autosøk)
- Kalender + mål + AI-foreslåtte neste handlinger
- Demo-modus med seed-data
- Risk-flags og bedre visualiseringer (graf over tid, etc.)

## Design

- Rolig, profesjonelt – mørk eller lys default? Forslag: lys med subtile aksentfarger, dark mode-toggle
- Match-score: fargekodet (grønn 80+, gul 60–79, rød <60)
- Tydelig typografi, mye whitespace, minner om Linear/Notion
