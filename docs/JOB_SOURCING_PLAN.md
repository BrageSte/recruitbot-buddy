# Job Sourcing Plan — Finn, NAV, LinkedIn

**Status i dag (mai 2026):** NAV/Arbeidsplassen fungerer skikkelig bra (offisiell feed + søke-API). Finn er i praksis manuell RSS. LinkedIn er fullstendig blokkert. Denne planen beskriver hvordan vi gjør sourcing **trygg, bred og profilstyrt** uten å falle tilbake på skjør HTML-skraping.

---

## TL;DR — anbefaling

1. **Behold NAV som primærkilde.** Den er allerede best-in-class; vi skal kun stramme inn re-spørringer mot søke-API-et og bruke profilen mer aggressivt.
2. **Gjør Finn til "saved-search-først, partner-API når tilgjengelig"** — fjern HTML-fallback fra default-flyten, behold den kun som engangs-opplåsing per bruker.
3. **LinkedIn løses med "bring your own alert"** — vi tar imot e-postvarsler eller delte URL-er, vi prøver ikke å scrape selv.
4. Bygg en felles **søkebrønn-modell** som driver alle tre kilder fra samme profilsignaler (`profile_interest_signals` + `cv_templates` + `match_visibility_rules`), slik at "min profil" er én sannhetskilde for hva som hentes inn.

Kort: NAV er motoren, Finn er en plug-in når du har nøkler, LinkedIn er en innkurv. Vi slutter å late som vi kan scrape de to siste.

---

## Hva er bygget i dag (kjapp inventar)

| Funksjon | Status | Notat |
|---|---|---|
| `ingest-arbeidsplassen-feed` | ✅ Solid | Bruker offisielle `pam-stilling-feed.nav.no` med token, ETag, cursor, since-modified. |
| `_shared/nav-search.ts` + `searchArbeidsplassenJobs` | ✅ Solid | Henter profil-spesifikke treff fra `arbeidsplassen.nav.no/stillinger/api/search`. |
| `match-user-jobs` (profile_search) | ✅ Solid | Booster `discovery.source = "profile_search"` med +35 i ranking. |
| `ingest-finn` (RSS) | 🟡 OK, manuell | Krever at brukeren limer inn lagret-søk-RSS fra Finn. |
| `ingest-finn` (FINN_API_ENDPOINT/KEY) | 🟡 Klar, mangler nøkler | Koden finnes, men er aldri satt opp i prod. |
| `ingest-finn` (HTML-fallback) | 🔴 Skjør | Blir blokkert (403/429/503). Default av i cron. |
| `auto-search` (Finn HTML) | 🔴 Skjør | Samme problem — limited use. |
| `import-linkedin` | 🟡 Brukerprofil bare | Henter LI-profil til brukeren; ofte blokkert. Ingen LI-jobber. |
| `suggest-source-feeds` | ✅ Solid | Foreslår Finn/NAV-søk fra profil + CV + matcher. |
| Generelle RSS via `poll-rss` | ✅ Solid | Brukerstyrt, fungerer. |

**Beslutning:** Vi bygger ikke om NAV-stacken — den er bra. All endring skjer rundt **Finn**, **LinkedIn**, og **profil → søk**-koblingen.

---

## Designprinsipper

1. **Profilen er prompten.** Alle automatiske søk skal genereres fra `profile_interest_signals`, `cv_templates` og bekreftede positive matcher — ingen hardkodede søk.
2. **Ingest skal være idempotent.** Samme jobb fra ulike kilder skal kollapse i `external_jobs` på `(provider, external_id)` (allerede slik).
3. **Trygghet før dekning.** Hvis en kilde krever scraping/innlogging — vis brukeren en tydelig oppskrift, ikke prøv å være "smart".
4. **Ingen oppdiktning.** En jobb finnes bare i basen hvis den faktisk er hentet fra en lovlig kilde. Ingen ekstrapolering.
5. **Feilslag skal være lesbar UI-state.** `source_ingest_state` og `auto_searches.last_status` skal vises på Kilder-siden med "hva gjør jeg nå?"-tekst.

---

## NAV / Arbeidsplassen — strammes ytterligere

NAV er allerede stødig. Forbedringer er kostnad-til-nytte-arbeid, ikke ny arkitektur.

### Det som funker
- `pam-stilling-feed.nav.no/api/v1/feed` med JWT token (rotated). Vi har `ARBEIDSPLASSEN_FEED_TOKEN` i prod, faller tilbake til `publicToken`-endepunktet.
- Daglig cron, ETag + If-Modified-Since, cursor-basert paginering opp til 50 sider per kjøring.
- `arbeidsplassen.nav.no/stillinger/api/search?q=...&size=...` brukes per-bruker i `match-user-jobs` for målrettede profilsøk.

### Forbedringer (P1-P2)
1. **Sett `ARBEIDSPLASSEN_FEED_TOKEN` i prod hvis ikke allerede gjort.** PublicToken roterer; egen partner-token er stabil.
2. **Profil-genererte søk skal bruke flere felt enn `q`.** Søke-API-et støtter facet-filter (yrke, sted, sektor). Utvid `nav-search.ts` til å sende structured params:
   - `q` = positive termer fra signal label
   - `municipal` / `county` fra location-signal når satt
   - `occupation_level1` fra strukturerte yrkes-signaler om vi lagrer dem
3. **Søk på "samme jobb hos NAV" når brukeren importerer en Finn-URL.** Hvis Finn-jobben også finnes på NAV (mange ATS-er publiserer begge), get vi rikere data gratis. Sjekk `external_jobs` på title+company+location, ev. søk Arbeidsplassen.
4. **Backfill-knapp i UI:** "Hent NAV-stillinger 90 dager tilbake for ditt nye profilsøk." Eksplisitt, brukerstyrt; kjører `match-user-jobs` med en større `since`-window.

### Risiko
- 5000-grense per filter på feeden. Vi treffer den kun hvis vi går veldig bredt; profilsøk-API-et er separat og rammet av andre rate-limits (vi rate-limiter allerede 1.2s mellom kall i Finn-flyten — bør gjelde NAV også når vi går over flere queries).

---

## Finn — to lovlige spor + én siste utvei

### Spor A: "Saved Search RSS" (det vi har)

Brukeropplevelse i dag:
1. Søk på finn.no/job
2. "Lagre søk" → "Mine sider → Lagrede søk"
3. Kopier RSS-URL
4. Lim inn på Kilder-siden

**Forbedringer (lavt henging frukt, P1):**
- **Onboarding-wizard** med skjermbilder (3 trinn) som kjører første gang brukeren går til Kilder.
- **`suggest-source-feeds` skal tilby ferdige Finn-URL-er + ett-klikks `Åpne i Finn`-lenke** når lagrede søk mangler. Da er flyten:
  1. Klikk "Foreslått søk: senior produktdesigner Oslo" → åpner Finn med søket utført
  2. Brukeren trykker "Lagre søk" → kopierer RSS
  3. Lim inn → vi koble RSS-URL til samme `source_suggestion`
- **Auto-import-pasta:** Slipp brukeren å lime inn URL-er — vi støtter at `rss_url` settes ved at brukeren limer inn på et felt som heter "Lim inn lagret søk her" og vi parser URL-en uansett om de limer inn HTML, hele lenken, eller bare query-strengen.

### Spor B: Finn Partner-API (når du har tilgang)

**Realsjekk på Finn API:** Finn API (`finn.no/api`) er ikke åpent. Det krever forretningsforhold + eierskap til data — typisk arbeidsgivere som annonserer. **Sjansen for at en kandidatsentrisk app som Søkly får full søke-API-nøkkel er liten.**

Tre realistiske scenarier:

**B1 — Du får en søke-API-nøkkel.** Da er den kjapp å koble til:
1. Sett env vars i Supabase: `FINN_API_ENDPOINT`, `FINN_API_KEY`, og evt. `FINN_API_AUTH_HEADER` (Schibsted bruker både `x-FINN-apikey` og `Authorization: Bearer`).
2. Koden i `ingest-finn/index.ts` (linje 311-325) plukker opp dette automatisk og legger til `official_api`-modus i ingest-runs.
3. Endre cron-body: `"includeOfficialApi": true, "includeUserFeeds": true, "includeHtmlSuggestions": false`.
4. Utvid `normalizeFinnApiPayload` til riktig payload-format når dokumentasjonen er kjent (i dag har vi defensiv normalisering, men endepunkt-spesifikke felt må mappes presist).

**Konkret sjekkliste når du får tilgang:**
- [ ] Bekreft endpoint-URL og om det er paginert (`page`/`size`/`cursor`)
- [ ] Avklar rate-limit (req/min, daglig kvote) → bygg backoff
- [ ] Avklar lisens på datafeltene → hva kan vi vise/logge?
- [ ] Bygg `external_id`-mapping (Finn ad-id → vår `finn-{id}`-format)
- [ ] Sett `provider_updated_at` fra Finns timestamps for delta-sync
- [ ] Skriv test i `src/test/finnApi.test.ts` med sample payload (mock fetch)

**B2 — Du får KUN en partner-RSS / merchant-feed.** Behandle som RSS, men med høyere rate-limit og mer pålitelig parsing.

**B3 — Du får ingenting.** Vi blir værende på Saved Search RSS. Det er greit; NAV har ~80% av norske stillinger uansett.

### Spor C: HTML-fallback — kun én-til-én, brukerinitiert

Aldri som default for alle brukere i cron (slik vi har det nå — bra).
Men: tillat det som **"Hent ferskt"-knapp** på en spesifikk `source_suggestion` (1 søk × N treff) når brukeren sitter foran skjermen og venter. Da er 403/429 et akseptabelt brukerfeil, ikke en stille feilmodus i bakgrunnen.

Allerede implementert via `FINN_HTML_FALLBACK_ENABLED=true` eller scoped-til-userId — bare gjør det synlig i UI og **ikke planlagt**.

---

## LinkedIn — innkurv, ikke crawler

LinkedIn API er kun tilgjengelig for offisielle Talent-API-partnere (som ikke er noe en kandidatsentrisk app får).
Scraping bryter ToS, gir authwall, og blir blokkert. Vi prøver ikke.

### Tre lovlige spor som faktisk virker

**LI-1: Forwarded Job Alerts → e-postparsing**
1. Brukeren oppretter LinkedIn Job Alerts som vanlig.
2. Setter opp en e-postregel som videresender alerts til `<bruker-id>@inbox.sokly.no`.
3. Vi parser e-postene (Postmark Inbound, Resend Inbound, eller SendGrid Parse), ekstraherer jobb-URL-er, scoper til riktig bruker, og lager `external_jobs`-rader.
4. Behandle `linkedin.com/jobs/view/<id>` URL-er som `external_id = linkedin-{id}`. Vi kan IKKE hente full beskrivelse uten authwall — så vi lagrer det e-posten gir oss (tittel, selskap, sted, snippet), markerer `description = null` og lar brukeren utvide hvis hen vil.

**Krever:** ny edge-function `ingest-linkedin-email`, ny tabell `inbound_email_aliases (user_id, alias, created_at)`, et e-post-domain.

**LI-2: Browser-extension / bookmarklet**
- "Søkly Clipper" som tar `window.location.href` + DOM på en LinkedIn jobside og POST-er til en eksisterende `/parse-job`-endpoint.
- Funker også for Finn og hvilken som helst nettside. Egentlig den mest fleksible løsningen.
- **Bygg dette uansett** — det løser også edge cases der NAV/Finn ikke har en jobb (firma-egen karriereside, BBC, etc.)

**LI-3: Manuell URL-paste**
Allerede implementert via "Ny jobb → URL". Behold som baseline.

### Hva vi IKKE gjør
- Public profile scraping av selskap/job (allerede blokkert i `import-linkedin/index.ts` — bra).
- Headless browser-flow med innlogging på vegne av brukeren. Brudd på ToS, kan få deg utestengt.

---

## Cross-cutting: profil → søk

Dette er kjernen i "bedre og mer trygg". I dag:

- `suggest-source-feeds` bygger forslag fra `master_profile + cv + signals + matches` (bra)
- `match-user-jobs` bruker `profileSearchQueries` for å re-spørre NAV med strong terms (bra)
- Men **brukeren ser ikke direkte koblingen** mellom "et signal" og "et søk", og kan ikke regenerere på en kontrollert måte

### Forbedring: "Mine søkeprofiler"-side

En enkel tabell på Kilder-siden:

| Søk | Provider | Drevet av | Siste hit | Handlinger |
|---|---|---|---|---|
| senior produktdesigner Oslo | NAV | role:produktdesigner +75, location:Oslo +60 | 4t siden, 12 nye | [pause] [rediger] [se hits] |
| AI ingeniør | NAV+Finn | skill:typescript +80, skill:llm +90 | 2d siden, 0 nye | [test nå] [slett] |

Hver rad = én `source_suggestion`. "Drevet av" viser de 2-3 sterkeste signalene som genererte søket.

**Hvorfor:** brukeren forstår *hvorfor* hen får disse jobbene → trener profilen sin direkte ved å justere signal-vekter.

### Forbedring: signal-feedback fra matcher

Når brukeren dismiss-er en match med >70 score, spør:
> "Var det noe spesifikt du ikke likte? `[reise mye]` `[stort konsern]` `[konsulent]` `[annen]`"

Lagre som `profile_interest_signal` med negative weight. Da former dismiss-flyten profilen, ikke bare match-historikken.

(Dette er allerede skissert i `match-user-jobs` via `job_score_feedback`; det vi mangler er **lukket loop** der feedback faktisk endrer signaler.)

---

## Faseplan

### Fase 1 — Stabilisering (1 uke)
- [ ] Sett `ARBEIDSPLASSEN_FEED_TOKEN` i prod
- [ ] Onboarding-wizard for "lim inn Finn lagret søk RSS" (3 steg, skjermbilder)
- [ ] "Mine søkeprofiler"-tabell på Kilder-siden
- [ ] Logg `source_ingest_state` på en synlig sticky-banner i UI når status != ok

### Fase 2 — Dekningsboost (1-2 uker)
- [ ] Browser-extension/bookmarklet "Lagre til Søkly" (LI + Finn + alle)
- [ ] Lukket-loop: dismiss-feedback → signal-mutering
- [ ] NAV-søk utvides med structured params (municipal, county, occupation)
- [ ] Cross-source dedupe: når Finn-import matcher en NAV-jobb (samme tittel+selskap+lokasjon), behold rikest data

### Fase 3 — LinkedIn-innkurv (1 uke + ekstern oppsett)
- [ ] Mottaks-domene (`inbox.sokly.no`) + Postmark/Resend Inbound
- [ ] `ingest-linkedin-email` edge-function
- [ ] `inbound_email_aliases`-tabell med RLS
- [ ] UI: "Sett opp LinkedIn-alerts → videresend til [din-alias]@inbox.sokly.no"

### Fase 4 — Finn API når tilgjengelig
- [ ] Sjekk Finn API-vilkår (`finn.no/api/getting-started`) — vi som kandidatsentrisk app er trolig utenfor scope, men verdt å spørre Schibsted
- [ ] Hvis nei: fokuser på Saved Search RSS-flyten (Fase 1) og glem Finn-API
- [ ] Hvis ja: følg sjekklisten under "Spor B" over

---

## Når du får Finn API — minimumsendring

Forutsatt at du får en standard REST-nøkkel:

**1. Supabase Functions secrets:**
```bash
supabase secrets set FINN_API_ENDPOINT="https://api.finn.no/iad/jobs/search?vertical=jobb"
supabase secrets set FINN_API_KEY="..."
```

**2. Endre cron-body i ny migrasjon:**
```sql
-- supabase/migrations/2026MMDDHHMMSS_finn_api_enabled.sql
SELECT cron.unschedule(jobid)
FROM cron.job WHERE jobname = 'daily-ingest-finn';

SELECT cron.schedule(
  'daily-ingest-finn',
  '35 6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://<project>.supabase.co/functions/v1/ingest-finn',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <anon>"}'::jsonb,
    body := '{
      "includeUserFeeds": true,
      "includeOfficialApi": true,
      "includeHtmlSuggestions": false,
      "maxSuggestionsPerUser": 5,
      "maxHitsPerSuggestion": 25
    }'::jsonb
  );
  $$
);
```

**3. Test:**
```bash
bun run test          # fanger eventuelle endringer i fullMatch
supabase functions invoke ingest-finn --body '{"includeOfficialApi":true,"includeUserFeeds":false}'
```

**4. Mapping-arbeid (sannsynlig):** Finn vil returnere et payload som ikke matcher dagens defensive normalisering 1:1. Forbered tester med ekte sample-payload før du slår på cron.

---

## Risikomatrise

| Risiko | Sannsynlighet | Konsekvens | Mitigasjon |
|---|---|---|---|
| Finn HTML blir blokkert i UI-fallback | Høy | Lav (brukerstyrt) | Tydelig feilmelding + alternativ via "Lagre søk" |
| NAV-feed token-rotasjon | Lav | Høy (ingest stopper) | `getFeedToken()` faller tilbake til publicToken — fungerer allerede |
| LinkedIn endrer e-post-format | Middels | Middels | Defensiv parser + lagre rå-e-post for re-parsing |
| Bruker setter opp filter for bredt → 5000+ NAV-treff | Middels | Lav | Klamping av `maxItems` allerede på plass |
| Vi henter samme jobb 3x via Finn-RSS, NAV-feed, LinkedIn-mail | Høy | Lav | `external_jobs.unique(provider, external_id)` + cross-source dedupe i Fase 2 |
| Finn API tilgang blir avslått | Høy | Lav | Saved Search RSS er allerede god nok; planen står uten Finn API |

---

## Kort om "trygt"

Det viktigste sikkerhetspunktet er at **vi aldri later som vi har data vi ikke har**:

- Hvis en jobb mangler beskrivelse (typisk LinkedIn fra e-post), vises `description = null` med "Bare snippet — åpne kilden for full tekst"-tekst i UI.
- Match-score skal ikke beregnes på tom beskrivelse — `match-user-jobs` skal returnere `match_score = null` med flag `insufficient_data: true`.
- AI-genererte søknader må refusere å lage tekst når jobbeskrivelsen er for tynn (allerede regelen i `generate-application`, men ekstra viktig for LI-mail-jobber).

---

## Beslutningsfilter sjekk

> "Would this make tomorrow's job-search session clearer, faster, or calmer?"

- ✅ NAV-stramming: brukeren ser flere relevante jobber uten manuelt arbeid
- ✅ Finn Saved Search wizard: tydeligere oppskrift = mindre frustrasjon
- ✅ Browser-extension: én-klikk lagring fra hvilken som helst karriereside
- ✅ LinkedIn email-innkurv: dekker LinkedIn uten ToS-brudd, automatisert per bruker
- ⚠️ Finn API: kun verdt det hvis tilgang er mulig — ellers skifter ressurser til extension

Alle punkter passerer filteret bortsett fra Finn-API som kun gir verdi gitt tilgang.
