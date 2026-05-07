# RecruitBuddy AI Coding Instructions

## Project Overview

**RecruitBuddy** is a job-search platform that treats job hunting as a structured project. Users manage jobs, applications, CVs, and interview pipelines from a single dashboard backed by Supabase Auth, Postgres, and Edge Functions. See [PROJECT_MEANING.md](../docs/PROJECT_MEANING.md) and [PRODUCT_PRINCIPLES.md](../docs/PRODUCT_PRINCIPLES.md) for the core philosophy.

## Tech Stack

- **Frontend**: Vite + React 18 + TypeScript + Tailwind CSS + shadcn/ui
- **Backend**: Supabase (Auth, Postgres, Storage, Edge Functions)
- **Testing**: Vitest + React Testing Library
- **Build**: Bun (canonical package manager)

## Architecture & Key Concepts

### Frontend Structure

```
src/
├── pages/            # Full-page components (Dashboard, Jobs, Applications, etc.)
├── components/       # Reusable UI components (shadcn/ui + custom)
├── hooks/           # Custom hooks (useAuth, useNotifications)
├── lib/             # Business logic (matching, scoring, CV operations)
├── integrations/    # External services (Supabase client & types)
└── test/            # Vitest unit & component tests
```

### Core Domain Objects

From [REPO_MAP.md](../docs/REPO_MAP.md), the system revolves around:

- **Profile**: User's master career story, scoring weights, rules (green/yellow/red), writing style
- **CV Template**: Structured factual career data (education, experience, skills); single source of truth
- **Job**: Parsed and scored job opportunity from external sources
- **Application**: Draft or sent cover letter tied to a specific job
- **Source**: Job feed configuration (Finn, Arbeidsplassen, RSS, URL, manual input)
- **Calendar Event**: Interview, follow-up, deadline, or custom milestone

### Business Logic Patterns

**Matching & Scoring** ([src/lib/fullMatch.ts](../src/lib/fullMatch.ts)):
- Tokenizes job descriptions and user signals (skills, roles, locations, values, dealbreakers)
- Normalizes text (lowercasing, diacritics, stop-word removal)
- Deduplicates jobs by provider + external_id
- Signals can have weights; negative weights indicate red flags

**Daily Coach** ([src/lib/dailyCoach.ts](../src/lib/dailyCoach.ts)):
- Prioritizes actions: urgent deadlines, follow-ups due, interviews, high-match jobs without drafts
- Surfaces weekly KPIs and next actions on the dashboard

**AI Integration**:
- Supabase Edge Functions handle parsing, scoring, and generation tasks
- Frontend invokes them for parsing jobs (`parse-job`), generating applications (`generate-application`), tailoring CVs (`tailor-cv`)
- AI must never invent experience outside the user's factual CV

### Routing & Auth

([src/App.tsx](../src/App.tsx), [src/hooks/AuthProvider.tsx](../src/hooks/AuthProvider.tsx)):
- Routes wrapped by `<ProtectedRoute>` require auth; unauthenticated users redirect to `/auth`
- Auth context via Supabase manages session state, sign-in, sign-up, magic links
- `/auth/callback` handles OAuth/email confirmation redirects

## Critical Workflows

### Build & Run

```bash
bun dev           # Start Vite dev server on http://localhost:8080
bun run build     # Production build to dist/
bun run preview   # Preview production build
bun run lint      # ESLint (must pass with zero warnings)
bun run test      # Run all Vitest tests
bun run test:watch # Watch mode for tests
```

### Database & Types

- **TypeScript types** are auto-generated from Supabase schema into [src/integrations/supabase/types.ts](../src/integrations/supabase/types.ts)
- **Supabase client** is initialized at [src/integrations/supabase/client.ts](../src/integrations/supabase/client.ts)
- Import types and client as: `import { supabase } from "@/integrations/supabase/client"`
- Queries use Supabase Postgrest syntax: `supabase.from("jobs").select("*").eq("user_id", userId)`

### Testing

- Test files colocate in [src/test/](../src/test/) by feature name
- Use `vitest run` for CI, `vitest` for local watch mode
- Setup is in [src/test/setup.ts](../src/test/setup.ts) (mocks `window.matchMedia`)

## Project-Specific Conventions

1. **Import Alias**: Use `@/` for all relative imports from `src/` (e.g., `import { supabase } from "@/integrations/supabase/client"`)

2. **Tailwind + shadcn/ui**: All UI components come from shadcn/ui or custom components styled with Tailwind. Design tokens are in [src/index.css](../src/index.css)

3. **State Management**: React Query for server state caching; React Context for auth; local state for UI ephemeral data

4. **React Router**: Version 6.30+ with nested routes. Redirect old routes (e.g., `/matches` → `/jobs`)

5. **ESLint Relaxed Mode**: Unused variables and explicit-any are disabled to reduce friction during rapid development. All other rules must pass with zero warnings.

6. **AI Guardrails**:
   - AI assists with judgment, generation, and summary—never sends applications without user approval
   - CV tailoring must stay within factual CV data; never invent experience
   - Risk flags and uncertain matches must be surfaced, not hidden
   - See [AI_RECRUITER.md](../docs/AI_RECRUITER.md) for detailed AI behavior guidelines

## External Services & Edge Functions

Supabase Edge Functions in [supabase/functions/](../supabase/functions/):
- `parse-job`: Parse job ad HTML/text into structured fields
- `generate-application`: Generate application text from CV + job + profile
- `tailor-cv`: Suggest CV tailoring for a specific application
- `import-cv`: Import CV from PDF/text
- `ingest-finn`, `ingest-arbeidsplassen-feed`: Scheduled job ingestion
- `match-user-jobs`: Score and match jobs for a user

All Edge Functions use shared Deno utilities in [supabase/functions/_shared/](../supabase/functions/_shared/).

## Common Pitfalls

- **Do not manually edit** [src/integrations/supabase/types.ts](../src/integrations/supabase/types.ts)—regenerate via Supabase CLI
- **Missing `@` alias**: Always use `@/` for cross-component imports
- **Not updating CV versions**: CV changes must be tracked in `cv_templates` with optional revision history
- **Ignoring product principles**: Check [PRODUCT_PRINCIPLES.md](../docs/PRODUCT_PRINCIPLES.md) before adding new UI surfaces; dashboard is the main workbench

## Resources

- [PROJECT_MEANING.md](../docs/PROJECT_MEANING.md): Core product vision
- [PRODUCT_PRINCIPLES.md](../docs/PRODUCT_PRINCIPLES.md): Design philosophy and AI guardrails
- [REPO_MAP.md](../docs/REPO_MAP.md): Detailed file and route documentation
- [AI_RECRUITER.md](../docs/AI_RECRUITER.md): AI behavior specification
- [Supabase Documentation](https://supabase.com/docs)
- [Vite Guide](https://vitejs.dev/guide/)
