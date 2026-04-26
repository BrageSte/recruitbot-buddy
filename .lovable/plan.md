# Cleaner & mer minimalistisk Dashboard

Dashbordet har i dag mye visuell støy: fargede gradient-bannere, fargekodede border-bokser i «Haster», mange små ikoner, og fem ulike sectioner stablet over hverandre (mål-banner, 4 KPI-kort, 3-kolonne grid, og «aktive søknader»-strip nederst). Resultatet er rotete og lite Linear/Notion-aktig.

## Mål

- Mindre visuell støy: færre farger, færre ikoner, færre rammer.
- Tydeligere hierarki: én ting i fokus øverst, resten roligere under.
- Mer hvitrom og luftigere typografi.
- Fortsatt all funksjonell info – bare presentert mer kontrollert.

## Endringer i `src/pages/Dashboard.tsx`

### 1. Header — roligere
- Behold hilsen + dynamisk undertittel.
- Flytt «Full kalender»-knapp til en mer diskret tekst-link (`variant="ghost"` med liten pil), eller fjern – kalender finnes i sidemeny.
- Fjern emoji 👋 (mer minimalistisk; valgfritt – beholder hvis brukeren vil).

### 2. Hovedmål-banner — flatere
- Fjern gradient (`bg-gradient-to-br from-primary/10 …`) og fargede border.
- Bruk vanlig `Card` med tynn border, liten farget prikk eller diskret `Target`-ikon i muted farge i stedet for `Badge`.
- Behold tittel + dato + ukentlig progress, men progress-baren blir tynnere (h-1) og uten gradient (bare `bg-primary`).

### 3. KPI-strip — slankere
- Behold 4 KPI-er, men gjør dem til én sammenhengende rad uten individuelle kort:
  - Én flat `Card` med 4 kolonner adskilt av tynne vertikale `border-r` linjer.
  - Mindre ikoner (eller fjern ikoner helt – bare label + tall).
  - Mindre padding.
- Resultat: føles som ett "stat-row", ikke fire bokser.

### 4. Tre-kolonne grid — luftigere og mer balansert
- Behold strukturen (Jobber | Agenda | Haster), men:
  - Reduser ikon-bruk i CardTitles: behold ett lite ikon i muted farge, fjern fargede aksenter (rose/primary/orange).
  - Bytt CardTitle-størrelse fra `text-base` til `text-sm font-semibold uppercase tracking-wide text-muted-foreground` (Notion-stil seksjons-headers).
  - Ensartet spacing mellom rader.

### 5. «Haster»-kolonne — fjern fargestøy
Dette er den største kilden til rot i dag. Hver urgent-item har sin egen fargede border + bakgrunn (orange, purple, amber, rose).
- Erstatt med en nøytral list-stil: hvit/transparent bakgrunn, ingen border, kun en liten 2px farget vertikal stripe til venstre som indikerer kategori.
- Eller enda enklere: kategori vises som liten muted label (samme som agenda-grupper), ingen farge i selve raden.
- Behold ikonet, men i muted farge – ikke fargekodet.

### 6. Aktive søknader-strip — integrér eller fjern
- Strippen nederst dupliserer info som finnes i KPI-er ("Aktive: N").
- **Forslag**: fjern strippen. Gjør KPI-en "Aktive" klikkbar (lenker til `/applications`) i stedet.

### 7. Generelt
- Reduser global gap fra `space-y-6` til `space-y-8` (mer luft).
- Reduser `gap-5` i grid til `gap-6`.
- Ensartet `text-sm` overalt; tall i `tabular-nums`.
- Fjern duplikate ChevronRight-piler – la hover-state være nok signal.

## Filer som endres

- `src/pages/Dashboard.tsx` — alle endringer over.

Ingen nye dependencies, ingen DB-endringer, ingen ruteendringer.

## Resultat

Mer Linear/Notion-aktig: ett rolig hovedinntrykk, klare seksjoner, lite farge (kun der det betyr noe – f.eks. en frist nær), mye luft. All funksjonalitet beholdt.
