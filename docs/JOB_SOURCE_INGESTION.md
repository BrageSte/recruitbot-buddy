# Job Source Ingestion

## Current Source Policy

Arbeidsplassen/NAV is the primary automatic source. The app keeps a shared `external_jobs` cache with `ingest-arbeidsplassen-feed`, then runs profile-specific searches and matching through `match-user-jobs`.

FINN uses stable sources first:

- user-provided RSS URLs from saved FINN searches;
- FINN partner API when `FINN_API_ENDPOINT` and `FINN_API_KEY` are configured;
- HTML search only as an explicit user-triggered fallback.

Generic RSS feeds still go through `poll-rss`, but `finn.no` feeds are owned by `ingest-finn` so the same FINN job is not imported both as a direct `jobs` row and as an `external_jobs` match candidate.

## Operational Notes

- `ARBEIDSPLASSEN_FEED_TOKEN` should be configured in production. The NAV public token endpoint is useful for experiments, but that token can rotate.
- Planned FINN ingest must keep `includeHtmlSuggestions: false`; HTML fallback is allowed only from UI actions that clearly label it as unstable.
- Public FINN search RSS URLs such as `finn.no/job/search.rss` are not treated as supported. The reliable user path is: search on FINN, save the search, copy the RSS URL from saved searches, and paste it into the app.
