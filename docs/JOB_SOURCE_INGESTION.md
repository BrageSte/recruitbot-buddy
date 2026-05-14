# Job Source Ingestion

## Current Source Policy

Arbeidsplassen/NAV is the primary automatic source. The app keeps a shared `external_jobs` cache with `ingest-arbeidsplassen-feed`, then runs profile-specific searches and matching through `match-user-jobs`.

FINN is manual RSS-first in v1:

- user-provided RSS URLs from saved FINN searches;
- FINN partner API is disabled by default even if env vars exist, and should only run when an explicit rollout sets `includeOfficialApi: true`;
- HTML search is not part of the default product flow.

Generic RSS feeds still go through `poll-rss`, but `finn.no` feeds are owned by `ingest-finn` so the same FINN job is not imported both as a direct `jobs` row and as an `external_jobs` match candidate.

## Operational Notes

- `ARBEIDSPLASSEN_FEED_TOKEN` is configured in production and was smoke-tested on 2026-05-14. The NAV public token endpoint remains as fallback, but the dedicated token is the intended path. See `docs/ARBEIDSPLASSEN_FEED_TOKEN_SETUP.md`.
- Planned FINN ingest must keep `includeHtmlSuggestions: false` and `includeOfficialApi: false` until there is an explicit FINN API rollout.
- Public FINN search RSS URLs such as `finn.no/job/search.rss` are not treated as supported. The reliable user path is: search on FINN, save the search, copy the RSS URL from saved searches, and paste it into the app.
