## Diagnose

Jeg sjekket databasen direkte:
- **27 av 38** auto-søk-jobber har `description = ''`, ingen `match_score` og fallback-summary `"Funnet via auto-søk: …"`.
- Samtidig batch: 24.04 fikk **9 av 36 scoret** – altså ~75 % feilet i én runde. Siste lille batch (2 jobber) fikk begge scoret.
- NAV-stillingsidene returnerer 130 KB HTML / 63 KB tekst – så `fetchJobText` har innhold nok. Problemet er ikke scraping.
- I koden returnerer `aiParse()` `null` ved **enhver** ikke-OK respons (typisk 429), og da lagres jobben helt tom – ingen beskrivelse, ingen score, ingen risk_flags.

**Rot­årsak:** Når en auto-søk-runde finner mange nye jobber (f.eks. 36), fyrer vi 36 AI-kall sekvensielt uten noen retry. Lovable AI Gateway rate-limiter per minutt, så de fleste kallene treffer 429 og jobbene havner i databasen som tomme skall.

Samme svakhet finnes i `poll-rss` (deler `enrich.ts`), men der er volumet typisk lavere per runde.

## Løsning

### 1. `supabase/functions/auto-search/enrich.ts` – robust AI-parse
- Legg til **retry med exponential backoff** for 429 og 5xx (3 forsøk: vent 2s, 5s, 12s).
- Logg statuskoden + en bit av responsbodyen ved feil, slik at vi kan se hva som skjer i Edge Function-logger.
- Returner et diskriminert resultat `{ ok: true, parsed } | { ok: false, reason: 'rate_limited' | 'no_credits' | 'error' }` istedenfor `null`, så caller vet om det var midlertidig.

### 2. `supabase/functions/auto-search/index.ts` – ikke lagre tomme jobber
- Hvis `aiParse` feilet med `rate_limited` eller `error`, **hopp over** jobben (ikke lagre noe) – cron neste time vil prøve på nytt fordi den fremdeles er "ny".
- Legg inn en liten **throttle mellom AI-kall** (300 ms) for å unngå å spike rate-limit.
- Hvis vi får `no_credits` (402): break ut av løkken og oppdater `auto_searches.last_error` med en tydelig melding.
- Tilsvarende endring i `poll-rss/index.ts` for konsistens.

### 3. Ny edge-funksjon `enrich-jobs` – fikser de 27 som allerede er tomme
- Velger jobber med `source IN ('auto_search','rss')`, `length(description) < 200`, `match_score IS NULL`, eldste først, maks 10 per kall.
- Henter `source_url`, kjører `fetchJobText` + `aiParse` (med ny retry-logikk), og oppdaterer raden in-place med beskrivelse, scores, deadline, ai_summary, risk_flags.
- Inserter `high_match_job`-notification hvis `match_score >= notify_high_match_min_score`.
- Schedulert via `pg_cron` hvert 30. minutt så backloggen drenes uten manuell handling.

### 4. UI-knapp "Hent manglende info" på Jobber-siden
- Liten knapp ved siden av "Vis arkiverte" som teller hvor mange jobber som mangler scoring (`match_score IS NULL`) og lar brukeren trigge `enrich-jobs` manuelt med toast-tilbakemelding ("Beriket 8 jobber, 19 gjenstår").
- Bruker `supabase.functions.invoke('enrich-jobs')` og `refetch()` etterpå.

### 5. Migrasjon
- Legg cron-job for `enrich-jobs` hvert 30. minutt (samme mønster som de eksisterende `poll-rss`/`auto-search`-cronene).

## Resultat
- Nye auto-søk-jobber blir **enten** ferdig beriket og scoret, **eller** ikke lagret i det hele tatt (prøves igjen neste runde).
- De 27 eksisterende tomme jobbene blir gradvis fylt ut av `enrich-jobs`-cronen, eller umiddelbart med ett klikk fra UI.
- Bedre logging gjør det enklere å se i Edge Function-loggene hvis AI-gatewayen begynner å feile igjen.
