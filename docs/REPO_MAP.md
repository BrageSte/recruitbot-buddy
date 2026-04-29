# Repo Map

## Overview

This repository is a Vite + React + TypeScript frontend backed by Supabase Auth, Postgres, Storage, and Edge Functions.

The frontend owns the user experience. Supabase owns identity, persistence, file storage, scheduled discovery, and AI-backed backend workflows.

## Top-Level Files

- `package.json`: npm scripts, runtime dependencies, and dev dependencies.
- `vite.config.ts`: Vite config, React SWC plugin, `@` alias to `src`, dev server on port `8080`.
- `tailwind.config.ts`: Tailwind design tokens and shadcn-compatible theme wiring.
- `src/index.css`: global design system, CSS variables, markdown styling, and CV page styles.
- `components.json`: shadcn/ui configuration.
- `eslint.config.js`: ESLint flat config for TypeScript and React Hooks.
- `vitest.config.ts`: Vitest config with jsdom and `@` alias.
- `README.md`: currently placeholder; should eventually point to these docs.
- `supabase/config.toml`: Supabase project id and Edge Function JWT verification settings.

Note: the repo currently has `package-lock.json`, `bun.lock`, and `bun.lockb`. Pick and document one canonical package manager before deployment work.

## Frontend Entry Points

- `src/main.tsx`: mounts the React app.
- `src/App.tsx`: wraps providers and defines routes.
- `src/hooks/useAuth.tsx`: Supabase auth context and sign in/up/out helpers.
- `src/components/ProtectedRoute.tsx`: redirects unauthenticated users to `/auth`.
- `src/components/AppLayout.tsx`: authenticated app shell with sidebar/mobile navigation.

## Routes and Pages

### `/auth`

File: `src/pages/Auth.tsx`

Email/password sign in and signup through Supabase Auth.

### `/`

File: `src/pages/Dashboard.tsx`

The daily workbench. Combines jobs, applications, calendar events, and goals into:

- weekly KPIs;
- main goal banner;
- must-apply list;
- new recent jobs;
- agenda;
- urgent items.

This page should remain action-oriented, not merely analytical.

### `/jobs`

File: `src/pages/Jobs.tsx`

Job inventory with filters, saved filters, source labels, status changes, and job creation from URL or pasted text through `parse-job`.

### `/matches`

File: `src/pages/Matches.tsx`

Full-match workbench. Shows per-user matches from the shared `external_jobs` cache, lets the user run profile matching, save a match into the normal `jobs` pipeline, or dismiss it as feedback.

### `/jobs/swipe`

File: `src/pages/JobSwipe.tsx`

Triage queue for discovered jobs. Updates `interest_level` and `status` based on left/right/up decisions.

### `/jobs/:id`

File: `src/pages/JobDetail.tsx`

Job detail, score breakdown, risk flags, source link, job description, notes, and "generate application" action through `generate-application`.

### `/applications`

File: `src/pages/Applications.tsx`

List of generated and sent applications.

### `/applications/:id`

File: `src/pages/ApplicationDetail.tsx`

Application workspace:

- preview and edit generated text;
- AI chat-based editing through `edit-application`;
- mark sent and update job status;
- choose CV/letter style;
- export cover letter and CV as PDF;
- request tailored CV suggestions through `tailor-cv`.

### `/calendar`

File: `src/pages/CalendarPage.tsx`

Job-search plan, goals, milestones, deadlines, sent applications, and manual calendar events. Uses `generate-plan` to create AI-generated target and weekly milestones.

### `/sources`

File: `src/pages/Sources.tsx`

Source management for:

- auto-searches across Arbeidsplassen, Finn, and LinkedIn fallback behavior;
- RSS feeds;
- manual run controls;
- blocked/error hints.

### `/cv`

File: `src/pages/CvTemplate.tsx`

Structured CV editor. Supports:

- AI import from pasted text or PDF through `import-cv`;
- profile photo upload to Supabase Storage;
- style selection;
- PDF export;
- editable sections for experience, education, skills, languages, projects, and certifications.

### `/profile`

File: `src/pages/Profile.tsx`

User profile and AI control surface:

- display name and LinkedIn;
- master profile;
- style guide;
- scoring weights;
- green/yellow/red rules;
- weekly goal;
- file uploads;
- auto-draft settings.

## Shared Components

### UI Primitives

Directory: `src/components/ui/`

shadcn/Radix primitives used throughout the app. Keep these close to generated shadcn patterns unless there is a strong reason to customize.

### Layout and Navigation

- `src/components/AppLayout.tsx`: authenticated sidebar layout.
- `src/components/NavLink.tsx`: local nav link helper if used.
- `src/components/ProtectedRoute.tsx`: auth gate.

### Scoring

- `src/components/ScoreBadge.tsx`: visual score indicator.

Score colors:

- green: `>= 80`;
- yellow: `>= 60`;
- red: `< 60`.

### CV and Letter System

Directory: `src/components/cv/`

- `cvStyles.ts`: five CV/letter style presets.
- `CvStylePicker.tsx`: style selector.
- `pdf/CvPdfDocument.tsx`: classic vector-PDF CV renderer.
- `pdf/LetterPdfDocument.tsx`: vector-PDF cover-letter renderer.
- `pdf/CvPdfPreview.tsx`: live PDF preview wrapper.
- `exportPdf.ts`: vector-PDF download helper using `@react-pdf/renderer`.
- `ApplicationChatEditor.tsx`: AI editing panel for application text.

This is a distinct print/document subsystem. Treat CV data as factual source material and follow `docs/AI_CV_HANDLING.md` for AI-produced CV data.

## Supabase Schema

Directory: `supabase/migrations/`

Important domain tables:

- `profiles`: user context, scoring weights, style guide, preferences.
- `profile_interest_signals`: structured role, task, skill, value, work-style, location, and dealbreaker signals used by the match engine.
- `source_suggestions`: AI-generated Finn search suggestions derived from profile, CV, interest signals, matches, and feedback.
- `user_roles`: role assignments; roles intentionally separate from profile.
- `external_jobs`: shared cache of available jobs from providers such as Arbeidsplassen and Finn.
- `user_job_matches`: per-user match scores and explanations for cached external jobs.
- `jobs`: discovered and user-added jobs, scores, risk flags, source, status.
- `job_score_feedback`: swipe and dismissal feedback used to improve later matching.
- `applications`: generated/sent application drafts tied to jobs.
- `application_events`: timeline events for applications.
- `uploaded_files`: metadata for user-uploaded files in Storage.
- `rss_feeds`: user RSS source definitions.
- `rss_seen_items`: de-duplication for RSS imports.
- `cv_templates`: structured CV source of truth.
- `application_cv_tweaks`: per-application tailored CV output.
- `saved_filters`: saved job-list filters.
- `auto_apply_settings`: auto-draft configuration.
- `auto_searches`: source/query configs for auto-search.
- `goals`: target goals and milestones.
- `calendar_events`: manual calendar events.

Storage buckets:

- `user-files`: private files such as CVs and previous applications.
- `cv-photos`: public CV profile photos.

RLS pattern:

- most user data is scoped by `user_id = auth.uid()`;
- service-role Edge Functions handle cross-user scheduled work.

## Supabase Edge Functions

Directory: `supabase/functions/`

### `parse-job`

Authenticated. Accepts a URL or pasted text, extracts job data, scores it against the user's profile, and inserts a `jobs` row.

### `generate-application`

Authenticated. Loads job, profile, and active CV template. Generates a cover-letter draft and CV notes, inserts an `applications` row, and may move the job from `discovered` to `considering`.

### `tailor-cv`

Authenticated. Loads an application, job, active CV, and profile. Generates per-application CV tailoring in `application_cv_tweaks`.

### `edit-application`

Authenticated by caller but currently does not instantiate Supabase auth. Accepts text, instruction, optional selection, and job context. Returns a rewritten full application text.

### `import-cv`

Authenticated at config level. Accepts pasted CV text or a base64 PDF and returns structured CV JSON matching `cv_templates`.

### `pick-cv-style`

Selects a CV style for a job or application. Uses service role and can update an application style.

### `generate-plan`

Authenticated. Creates a main target goal and AI-generated weekly milestones.

### `poll-rss`

Unauthenticated at config level for cron/manual backend invocation. Uses service role. Polls active RSS feeds, parses new items, scores them, inserts jobs, and can trigger auto-drafts.

### `auto-search`

Unauthenticated at config level but scopes to user if a valid auth header is present. Uses service role. Searches Arbeidsplassen, Finn, and LinkedIn fallback flows, enriches results, and inserts jobs.

### `ingest-arbeidsplassen-feed`

Unauthenticated at config level for cron/manual backend invocation. Uses NAV's official job vacancy feed to maintain the shared `external_jobs` cache and mark inactive ads.

### `ingest-finn`

Unauthenticated at config level for backend/manual invocation. Uses official Finn API when configured; otherwise ingests user-provided Finn RSS feeds as fallback.

### `suggest-source-feeds`

Authenticated. Generates and upserts suggested Finn job searches for the user. Suggestions are enabled by default through `profiles.auto_source_suggestions_enabled` and can be paused, edited, dismissed, or connected to a user-provided RSS URL.

### `match-user-jobs`

Authenticated. Loads the user's profile, CV, interest signals, feedback, and active external jobs; creates/updates `user_job_matches`; can save or dismiss a match.

### `auto-search/enrich.ts`

Shared enrichment helpers for job-page fetch, HTML cleanup, AI parse, and weighted score.

## Tests

- `src/test/example.test.ts`: placeholder passing test.
- `src/test/setup.ts`: jest-dom setup and `matchMedia` mock.

Current test coverage does not exercise product behavior. Add tests around data transforms, AI response parsing, status transitions, and high-risk UI flows as the codebase stabilizes.

## Local Commands

From `package.json`:

- `npm run dev`: local Vite app.
- `npm run build`: production build.
- `npm run build:dev`: development-mode build.
- `npm run lint`: ESLint.
- `npm run test`: Vitest one-shot.
- `npm run test:watch`: Vitest watch mode.
- `npm run preview`: preview production build.

If these commands fail with `command not found`, install dependencies first with the chosen package manager.

## Known Governance Gaps

- README is placeholder.
- Package-manager choice is ambiguous.
- AI prompts are duplicated across Edge Functions.
- Edge Function auth posture should be reviewed before production deployment.
- Generated Supabase types may need regeneration after migrations.
- Tests are minimal.
- Deploy strategy is not yet decided: Lovable, Vercel, Cloudflare, Supabase hosting pairing, or another path.
