## Mål

Gi alle interne sider (Søknader, Jobber, Kalender, Kilder, CV, Profil, Søknad-detalj) samme polerte, innbydende uttrykk som forsiden og dashbordet — samme header, KPI-strip, kort, tomme tilstander, hover-effekter, ikoner og fargetokens.

## Felles designspråk (gjeldende for alle sider)

- **Sidecontainer:** `max-w-6xl mx-auto p-4 md:p-6 lg:p-10 space-y-8` (Dashboard har `max-w-7xl` — beholdes)
- **Header:** ikon-chip i `bg-gradient-primary` + H1 (`text-2xl md:text-3xl font-semibold tracking-tight`) + kort underlinje, knapper høyrejustert
- **KPI-strip:** 3–4 kort med ikon, tall (tabular-nums), liten label — samme stil som Dashboard
- **Kort:** `Card` med `hover:shadow-elevated transition-shadow` og venstre fargestripe (`border-l-2`) for status der det gir mening
- **Tomme tilstander:** `Card` med stort ikon, overskrift, beskrivelse og CTA-knapp (ikke bare "Ingen treff")
- **Status-piller:** gjenbruk samme `STATUS_TONE`-palett som i Søknader/Jobber (en delt helper `src/lib/statusStyles.ts`)
- **Loading:** `Skeleton`-rader i stedet for "Laster…"-tekst
- **Footer-linje:** liten "Tips: …"-stripe nederst der det er nyttig (lik DailyCoachPanel)

## Endringer per side

### 1. `src/pages/Applications.tsx` (hovedfokus)

Nåværende side er flat: enkel header, faner, listekort uten ikon eller hover-aksent.

Ny struktur:

```text
┌─ Header (ikon-chip + tittel + "Ny søknad fra jobb"-CTA)
├─ KPI-strip: Utkast | Sendt | Svar/Intervju | Tilbud
├─ Tabs (samme som i dag, men full bredde + telleboble til høyre)
├─ Søk + sortering (ny: input + DropdownMenu "Sorter etter")
├─ Liste — kort med:
│    · venstre fargestripe etter status
│    · ikon (FileText/Send/CalendarClock/Award)
│    · tittel · firma · status-pille · sendt-dato · score-badge
│    · hover:shadow-elevated
└─ Tom tilstand: ikon, "Ingen søknader ennå", CTA "Finn jobber" → /jobs
```

Konkret:
- Bytt header til samme mønster som Jobs/Dashboard (gradient-ikon-chip).
- Legg til KPI-rad over Tabs.
- Legg til søk + sortering (created_desc, sent_desc, status, deadline).
- Forsterk listekortene med venstre stripe basert på `STATUS_TONE`, ScoreBadge når `match_score` finnes, og frist-info når jobben har deadline.
- Erstatt `Loader2`-spinner med 5 `Skeleton`-rader.
- Forbedre tom tilstand med CTA til `/jobs`.

### 2. `src/pages/Jobs.tsx`

- Header får samme gradient-ikon-chip og to-linjes undertekst.
- Knappene grupperes: primær "Finn nye jobber" + ikon-knapper for sortering/filter/sveip i en `border rounded-md`-toolbar.
- KPI-strip: Nye denne uka · Topp-matcher (≥80) · Ufullstendige · Arkivert.
- Listekort får venstre fargestripe etter status (samme palett) og hover-shadow.
- Tom tilstand: "Ingen matcher ennå — kjør Finn nye jobber" med stor CTA.

### 3. `src/pages/CalendarPage.tsx`

- Header får ikon-chip + KPI: I dag · Denne uka · Frister 7d · Intervjuer.
- "Lag mål"-knapp blir primærknapp øverst til høyre.
- Tom tilstand på agenda-fanen får ikon + tekst + CTA "Sett ukesmål".

### 4. `src/pages/Sources.tsx`

- Header med ikon-chip + KPI: Aktive feeds · Auto-søk · Treff sist 24t · Feil.
- Hver feed/auto-søk-rad får venstre stripe etter `last_status` (grønn/gul/rød/grå) og hover-shadow.

### 5. `src/pages/CvTemplate.tsx`

- Header får ikon-chip + KPI: Varianter · Standard-stil · Sist redigert.
- Variant-listen blir kortgrid med hover-shadow og "stjerne for standard".
- Stor "Last opp CV"-zone matcher Demo-siden (dashed border, Upload-ikon).

### 6. `src/pages/Profile.tsx`

- Header med ikon-chip + kort beskrivelse "Din profil styrer matching, CV og søknader".
- Seksjoner i kort med tydelige overskrifter (Stil, Vekter, Regler, Auto-apply, Filer).
- Lagre-knapp blir sticky nederst på mobil.

### 7. `src/pages/ApplicationDetail.tsx`

- Top-bar (Tilbake | Tittel | Status-velger | Lagre/Send) får samme rounded toolbar som Jobs.
- Tabs får samme stil som Søknader-fanene.
- Vedleggs-rader får venstre stripe etter `extraction_status`.

### 8. Nye hjelpere

- `src/lib/statusStyles.ts` — eksporterer `APPLICATION_STATUS_TONE`, `JOB_STATUS_TONE`, `SOURCE_STATUS_TONE` og en `statusStripe(status)`-funksjon (returnerer Tailwind-klasser for `border-l-*`).
- `src/components/PageHeader.tsx` — gjenbrukbar header (ikon-chip, tittel, undertekst, action-slot). Brukes i alle sider over.
- `src/components/KpiStrip.tsx` — gjenbrukbart KPI-grid (4 kolonner på desktop, 2 på mobil).
- `src/components/EmptyState.tsx` — ikon + tittel + tekst + CTA.

## Det som ikke endres

- Forretningslogikk, queries, ruting, AuthProvider, AppLayout, Landing, Demo, Dashboard (allerede polert).
- Design-tokens i `index.css` — alt eksisterer allerede.
- Mobil-meny / sidebar.

## Tekniske notater

- Alle nye komponenter er rene TSX uten ekstra avhengigheter.
- Bruker eksisterende `Card`, `Button`, `Badge`, `Skeleton`, `DropdownMenu` fra shadcn.
- Ingen migreringer eller edge functions endres.

## Rekkefølge

1. Lag delte komponenter (`PageHeader`, `KpiStrip`, `EmptyState`, `statusStyles.ts`).
2. Refaktorér `Applications.tsx` (synlig effekt umiddelbart).
3. Oppdatér `Jobs`, `CalendarPage`, `Sources`, `CvTemplate`, `Profile`, `ApplicationDetail` til samme mønster.
