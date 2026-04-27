## Mål
Når man åpner en søknad skal selve stillingsannonsen være lett tilgjengelig — uten å måtte navigere tilbake til jobben.

## Hva legges til på `ApplicationDetail`

Et nytt "Stillingsannonse"-kort plasseres rett under headeren (over fanene), slik at konteksten alltid er synlig:

1. **Tittel + selskap + sted** (allerede tilgjengelig via `app.jobs`)
2. **Lenke til original annonse**
   - Knapp: "Åpne original annonse" → `app.jobs.source_url` (åpnes i ny fane)
   - Vises kun hvis `source_url` finnes
   - Vis også domenet som liten tekst (f.eks. `finn.no`)
3. **AI-oppsummering (kort)**
   - Bruker eksisterende `jobs.ai_summary` hvis den finnes
   - Hvis den mangler: vis knapp "Lag AI-sammendrag" som kaller en ny edge-funksjon `summarize-job` (kort 2–4 setningers oppsummering: hva rollen handler om, viktigste krav, hva som er spesielt). Resultat lagres i `jobs.ai_summary`.
4. **Full annonsetekst (sammenleggbar)**
   - Et `<details>`/Collapsible: "Vis full annonsetekst" → viser `app.jobs.description`
   - Standard: kollapset, så det ikke tar plass
5. **Direktelenke til jobben i appen**
   - Liten lenke "Åpne i jobbvisning" → `/jobs/:job_id` for full kontekst (notater, score, osv.)

## Edge-funksjon: `summarize-job` (ny)
- Input: `{ jobId }`
- Henter `jobs.title`, `jobs.company`, `jobs.description`
- Bruker Lovable AI Gateway (samme mønster som `tailor-cv`) til å lage 2–4 setninger på norsk
- Lagrer i `jobs.ai_summary` og returnerer teksten
- Kalles automatisk første gang en søknad åpnes hvis `ai_summary` mangler og `description` finnes (med en liten "genererer…" indikator), eller manuelt via knapp

## Filer som endres
- `src/pages/ApplicationDetail.tsx` — nytt JobContextCard mellom header og Tabs
- `src/components/JobContextCard.tsx` (ny) — gjenbrukbar komponent som tar imot `job` og viser annonse-info
- `supabase/functions/summarize-job/index.ts` (ny)
- `supabase/config.toml` — registrer ny funksjon (verify_jwt = true)

## Ingen DB-endringer
Alt ligger allerede i `jobs`-tabellen (`ai_summary`, `description`, `source_url`).
