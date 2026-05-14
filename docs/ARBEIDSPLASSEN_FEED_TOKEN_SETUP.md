# Arbeidsplassen Feed Token

## Status

`ARBEIDSPLASSEN_FEED_TOKEN` er konfigurert som Supabase secret i prod for project `ndhzxaamwoviqqwwfioe`.

Siste manuelle smoke test ble kjørt 2026-05-14 mot `ingest-arbeidsplassen-feed` og returnerte:

- `ok: true`
- `pages: 2`
- `seen: 5`
- `activeUpserted: 4`
- `inactiveUpdated: 1`
- `errors: 0`

Koden leser først `Deno.env.get("ARBEIDSPLASSEN_FEED_TOKEN")` og faller tilbake til NAV sitt public token-endepunkt hvis secret mangler. Fallbacken beholdes foreløpig som sikkerhetsnett.

## Hva Som Ikke Skal Committes

- Selve NAV-tokenet.
- One-time-secret-lenker.
- Passphrases.
- Personlige kontaktinstrukser eller intern e-posthistorikk.
- `.env.local` eller andre lokale secret-filer.

Tokenet skal ligge i Supabase secrets og i passordhvelv, ikke i repoet.

## Verifisere Secret

Bekreft at secret finnes. Verdien vises ikke:

```bash
supabase secrets list --project-ref ndhzxaamwoviqqwwfioe | grep ARBEIDSPLASSEN_FEED_TOKEN
```

Sette eller rotere token:

```bash
supabase secrets set ARBEIDSPLASSEN_FEED_TOKEN="<NAV_FEED_TOKEN>" \
  --project-ref ndhzxaamwoviqqwwfioe
```

## Manuell Smoke Test

Supabase CLI-versjoner kan variere i støtte for `functions invoke`. HTTP-kall fungerer uansett:

```bash
ANON_KEY=$(node -e "const fs=require('fs'); const s=fs.readFileSync('src/integrations/supabase/client.ts','utf8'); console.log(s.match(/SUPABASE_PUBLISHABLE_KEY = \"([^\"]+)/)[1])")

curl -sS -X POST "https://ndhzxaamwoviqqwwfioe.supabase.co/functions/v1/ingest-arbeidsplassen-feed" \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  --data '{"maxPages":2,"maxItems":50}'
```

Forventet respons:

```json
{
  "ok": true,
  "provider": "arbeidsplassen",
  "errors": 0
}
```

## Sjekke Ingest State

```sql
SELECT provider, last_status, last_error, last_run_stats, updated_at
FROM public.source_ingest_state
WHERE provider = 'arbeidsplassen';
```

Akseptkriterier:

- `last_status` er `ok` eller `partial` hvis ingest ble pauset midt i feeden.
- `last_run_stats.errors = 0`.
- `updated_at` er nylig etter manuell test eller cron-run.

## Sjekke Cron

`jobname` ligger på `cron.job`, ikke på `cron.job_run_details`.

```sql
SELECT
  j.jobname,
  d.status,
  d.return_message,
  d.start_time,
  d.end_time
FROM cron.job_run_details d
JOIN cron.job j USING (jobid)
WHERE j.jobname = 'ingest-arbeidsplassen-hourly'
ORDER BY d.start_time DESC
LIMIT 10;
```

Forventet: siste relevante run har `status = 'succeeded'`, og function logs viser ikke 401/403 mot NAV.

## Rotasjon

Når NAV sender nytt token:

1. Lagre nytt token i passordhvelv som ny versjon.
2. Sett Supabase secret med kommandoen over.
3. Kjør manuell smoke test.
4. Sjekk `source_ingest_state`.
5. Sjekk neste cron-run.
6. Behold gammelt token i passordhvelv i en kort verifikasjonsperiode, og slett det etterpå.

## Fremtidige Forbedringer

- Legg til Deno-test for at `Authorization: Bearer <token>` settes når env-var finnes.
- Vis tydelig health-state i `/sources` når `source_ingest_state.last_status = 'error'`.
- Vurder å fjerne publicToken-fallback etter minst 30 dager stabil drift med dedikert token.

