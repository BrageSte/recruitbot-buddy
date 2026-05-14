# Dashboard and Onboarding Plan

> **Strategisk forankring (mai 2026):** Denne planen lever under den oppdaterte posisjonen
> "Søkly = norsk jobbsøker-operativsystem" — se [STRATEGY.md](./STRATEGY.md),
> [BUSINESS_CASE.md](./BUSINESS_CASE.md) og [MARKET_ANALYSIS.md](./MARKET_ANALYSIS.md).
> Dashboard og onboarding skal nå spesielt løfte tre ting: **transparent match**,
> **norsk-modus tailoring (privat/offentlig/"uten søknadsbrev")** og **synlig datakontroll**.

## Product Intent

The app should help the user work on getting a job as if job searching is a job.

That means the first logged-in experience should not feel like a blank database. It should guide the user toward a working job-search system:

- profile;
- CV;
- sources;
- goals;
- dashboard;
- next actions.

## Dashboard Purpose

The dashboard is the daily command center.

It should answer, in order:

1. What needs attention today?
2. Which opportunities should I prioritize?
3. What is coming soon?
4. Am I progressing toward my job-search goal?
5. Are my sources working?

## Current Dashboard Strengths

The current dashboard direction makes sense because it already includes:

- urgent items;
- deadlines;
- interview/follow-up events;
- high-score jobs without drafts;
- new recent jobs;
- weekly goal progress;
- agenda;
- active application summary.

This is closer to a real job-search workbench than a generic analytics page.

## Dashboard Information Hierarchy

### 1. Today / Next Actions

Top priority section.

Should include:

- deadlines today or soon;
- interviews today/tomorrow;
- follow-ups due;
- high-match jobs without drafts;
- draft applications waiting for review;
- sources with errors if they block discovery.

Each item should have one obvious action:

- open job;
- generate draft;
- review application;
- mark sent;
- add follow-up;
- fix source.

### 2. Goal and Milestones

The user should see the current plan:

- main target date;
- weekly application target;
- progress this week;
- next milestone;
- missed/completed milestones.

Tone should be supportive, not guilt-driven.

### 3. New Opportunities

Show fresh jobs from connected sources:

- high score first;
- mark source;
- show deadline if available;
- show risk flags;
- allow quick triage.

The user should be able to move from "new job found" to "draft created" quickly.

### 4. Pipeline Snapshot

Compact view of:

- discovered;
- considering;
- drafts;
- sent;
- responses;
- interviews;
- offers/rejections.

Use this to orient the user, not to dominate the dashboard.

### 5. Calendar / Agenda

Show the next upcoming events:

- application deadlines;
- interviews;
- follow-ups;
- milestones;
- manual notes.

Calendar should be connected to status changes. For example, marking an application as sent should make follow-up suggestions possible later.

### 6. Source Health

Small but important.

Show:

- active sources;
- last checked;
- new jobs found;
- errors or blocked sources;
- manual fallback instructions where needed.

## Suggested Dashboard Layout

Desktop:

- top header: greeting, short "today" summary, primary action;
- full-width main goal or onboarding banner;
- three-column body:
  - left: next actions and must-apply jobs;
  - middle: agenda/milestones;
  - right: urgent/source health/pipeline summary;
- lower section: active applications and recent activity.

Mobile:

- stacked sections;
- next actions first;
- collapsible details;
- avoid dense multi-column cards.

## Dashboard States

### New User

Dashboard should become onboarding.

Show setup checklist:

- create profile;
- import or create CV;
- add first source;
- add or parse first job;
- set job-search goal;
- generate first draft.

Each checklist item should link directly to the relevant screen.

### Active Job Seeker

Show daily workbench:

- next actions;
- must-apply jobs;
- agenda;
- milestones;
- source health;
- pipeline snapshot.

### No Jobs Yet

Primary action should be adding a source or pasting a job URL/text.

Secondary action can be completing the profile/CV if missing.

### Has Jobs but No CV

Primary action should be creating/importing CV before generating applications.

### Has Drafts but No Sent Applications

Primary action should be reviewing and sending first draft.

### Has Sent Applications

Dashboard should introduce follow-up discipline and interview prep.

### Source Errors

Dashboard should surface source problems as fixable work, not hidden backend noise.

## Onboarding Purpose

Onboarding should create enough context for the AI recruiter to be useful quickly.

It should not ask for everything up front. It should create the minimum viable job-search workspace and then let the user improve it over time.

## Recommended Onboarding Flow

### Step 1: Goal

Ask:

- What kind of job are you looking for?
- When would you ideally like to have a job?
- How many applications per week feels realistic?

Creates:

- initial profile search intent;
- main goal;
- weekly target.

### Step 2: Profile Basics

Ask:

- name;
- LinkedIn URL;
- location/remote preference;
- target roles;
- preferred industries;
- dealbreakers.

Writes:

- `profiles.display_name`;
- `profiles.linkedin_url`;
- initial master profile/search rules where possible.

### Step 3: CV Import

Offer:

- upload PDF;
- paste CV text;
- create manually.

Uses:

- `import-cv` for PDF/text;
- `cv_templates` as structured output.

Important: user must review imported CV before it becomes the trusted factual source.

### Step 4: AI Recruiter Calibration

Ask the user to tune match criteria:

- professional fit;
- culture fit;
- practical fit;
- enthusiasm;
- green flags;
- yellow flags;
- red flags.

Default weights can remain:

- professional: 40;
- culture: 20;
- practical: 20;
- enthusiasm: 20.

### Step 5: Add Sources

Offer:

- Arbeidsplassen auto-search;
- Finn RSS or manual fallback;
- LinkedIn manual/job alert guidance;
- paste first job URL/text.

Make source limitations clear. LinkedIn and Finn scraping may need manual fallbacks.

### Step 6: First Action

After setup, send the user to a focused dashboard state:

- "We found/added these jobs";
- "Review top matches";
- "Generate your first draft";
- "Set follow-up reminders".

## Onboarding Implementation Ideas

### Option A: Dedicated `/onboarding` Route

Pros:

- clear state machine;
- easy to resume;
- easier to test;
- can redirect incomplete users.

Cons:

- requires new route and persistence for onboarding step.

### Option B: Dashboard Setup Mode

Pros:

- faster to implement;
- dashboard immediately teaches the product;
- less separate UX.

Cons:

- dashboard logic can get messy if setup state grows.

Recommended first move: dashboard setup mode. If it becomes complex, extract to `/onboarding`.

## Onboarding Completion Signals

Consider onboarding "usable" when:

- profile exists;
- CV template exists or user explicitly skipped CV;
- at least one source or one job exists;
- weekly goal exists;
- user has seen the dashboard next-action model.

Do not require all fields to be perfect.

## AI Recruiter Placement

The AI recruiter should appear as assistance inside workflows, not as a generic chatbot first.

Good placements:

- dashboard next-action explanations;
- job detail match reasoning;
- application generation;
- application edit panel;
- CV tailoring;
- plan generation;
- source fallback instructions.

Later, a recruiter chat could sit on top of these workflows, but it should be grounded in the same data and actions.

## Home Page Strategy

If this becomes a public product, the logged-out home page should sell the outcome:

Primary headline direction:

- "Samle hele jobbsokingen ett sted"
- "Jobbsoking gjort enkelt"
- "Jobb med a fa jobb, uten kaoset"

Core value props (oppdatert mai 2026):

- transparent match — vi viser deg krav-for-krav hvorfor en jobb passer (eller ikke);
- norsk-modus for CV og søknad — privat sektor, offentlig sektor, eller "uten søknadsbrev";
- jobflow — frister, oppfølging, neste handling, alt på ett sted;
- ærlige drafts fra ditt eget CV — ingen oppdiktet erfaring;
- datakontroll synlig i UI — slett, eksporter, slå av modellæring.

Avoid positioning as merely "AI writes cover letters." That is a feature, not the product.
Søkly er et **norsk jobbsøker-operativsystem**, ikke en AI-generator.

## Near-Term Product Backlog

### Dashboard

- Add setup/onboarding state for incomplete users.
- Clarify "next actions" as top section.
- Add draft applications waiting for review.
- Add source health card.
- Add follow-up suggestions after sent applications age.
- Add quick actions from high-match jobs.

### Onboarding

- Create dashboard setup checklist.
- Add guided CV import/review.
- Add goal creation prompt if no active goal.
- Add first source setup helper.
- Add "paste first job" shortcut.

### AI Recruiter

- Add match reasoning field or display derived reasoning from score/risk data.
- Add feedback controls: "good match", "not relevant", "bad score".
- Centralize prompts before deeper tuning.

### Sources

- Make source reliability explicit.
- Improve manual fallback guidance.
- Prefer stable APIs where available.

### Deployment Strategy

To evaluate next:

- keep Lovable as builder/backend gateway or move frontend deploy elsewhere;
- decide where Edge Functions live long-term;
- decide package manager;
- set up environment variable strategy;
- review unauthenticated service-role functions;
- choose preview and production deploy flow.

## Decision Questions for Next Step

- Is this currently for personal use first, public SaaS later, or both immediately?
  *(Avklart i [BUSINESS_CASE.md](./BUSINESS_CASE.md): personal first → soft launch → public SaaS over 12 mnd.)*
- Should Lovable remain the AI gateway, or should the app own a provider-neutral AI layer?
- Should the first deploy be fastest possible or production-shaped from the start?
- Should onboarding be dashboard-based first or a dedicated route?
  *(Foreslått: dashboard setup mode først; ekstrahér til /onboarding hvis state-logikken vokser.)*
- What is the canonical product name?
  *(Arbeidsnavn: **Søkly**. Lås etter domene/foretak/varemerke-sjekk — se [STRATEGY.md](./STRATEGY.md) → Navnvurdering.)*

## Anbefalte oppdateringer ut fra ny strategi

Etter markedsanalysen mai 2026 bør backloggen prioritere:

1. **Match-forklaring i dashboard og jobbdetalj** — vis krav-for-krav (dekket / delvis / mangler) med evidens fra CV. Dette er Søklys signatur og bør være det første brukeren ser etter at en jobb er parsed.
2. **Norsk-modus i tailoring-flow** — eksplisitt valg mellom privat sektor, offentlig sektor og "uten søknadsbrev" (CV-first). Default styres av jobbkilde og bransje hvis mulig.
3. **Privacy-card på dashboard og i innstillinger** — synlig datakontroll: slett, eksporter, "ikke til modelltrening"-toggle, audit log. Ikke gjem dette i en juridisk fotnote.
4. **Source health med kildeprioritet** — Arbeidsplassen/NAV først, deretter utvalgte arbeidsgiversider. Manuelle fallbacks tydelig kommunisert.
5. **Onboarding setter forventning om transparens, ikke automasjon** — første tekst brukeren leser bør si "vi viser deg hvorfor", ikke "vi skriver søknaden for deg".
