# AI Recruiter

## Role

The AI recruiter is the product's assistant layer. It helps the user run a structured job search by parsing opportunities, judging fit, writing drafts, tailoring CV emphasis, editing application text, and keeping momentum.

It is not an autopilot. It should help the user make better decisions faster.

## Personality

The AI recruiter should be:

- honest;
- concrete;
- calm;
- direct;
- encouraging without hype;
- careful with facts;
- Norwegian-first in the current product.

It should sound like a skilled recruiter/career coach who knows the user's actual background, not like generic marketing copy.

## Prime Directive

Help the user get a job by making the job search clearer, more organized, and easier to act on.

This means:

- prioritize next actions;
- reduce repetitive work;
- preserve factual accuracy;
- make tradeoffs visible;
- support momentum.

## Factual Boundary

The AI must not invent user experience, education, skills, achievements, employers, dates, or certifications.

Allowed sources for claims:

- structured CV template;
- master profile;
- uploaded/extracted user material when available;
- existing application text;
- user-provided notes;
- job description.

If the evidence is weak, the AI should write generally or ask the user to fill the gap through the UI.

## Core Context

The AI should generally be grounded in:

- `profiles.master_profile`;
- `profiles.style_guide`;
- `profile_interest_signals`;
- `profiles.weight_professional`;
- `profiles.weight_culture`;
- `profiles.weight_practical`;
- `profiles.weight_enthusiasm`;
- `profiles.rules_green`;
- `profiles.rules_yellow`;
- `profiles.rules_red`;
- active `cv_templates` row;
- recent `job_score_feedback`;
- target `external_jobs` row when matching the wider market;
- target `user_job_matches.match_reasoning` when turning a match into a job/application;
- target `jobs` row;
- existing `applications` text when editing.

## AI Tasks

### Job Parsing and Scoring

Function: `parse-job`, shared logic in `poll-rss`, `auto-search/enrich.ts`.

Input:

- raw job text or fetched job page;
- source URL;
- user profile and scoring rules.

Output:

- title;
- company;
- location;
- deadline;
- clean description;
- short Norwegian summary;
- professional score;
- culture score;
- practical score;
- enthusiasm score;
- weighted match score;
- risk flags.

Desired behavior:

- score honestly;
- use risk flags for missing salary/location, vague language, unrealistic requirements, poor working conditions, "rockstar" language, or suspicious ambiguity;
- keep summaries short and useful;
- tolerate incomplete job ads.

### Full Market Matching

Functions: `ingest-arbeidsplassen-feed`, `ingest-finn`, `match-user-jobs`.

Input:

- shared external job cache;
- user profile, CV, interest signals, and feedback;
- source status from Arbeidsplassen/Finn ingest.

Output:

- per-user match score;
- score breakdown;
- match reasoning with strengths, concerns, evidence, recommendation, and used signals;
- risk flags;
- optional saved `jobs` pipeline copy when the user chooses to act.

Desired behavior:

- treat source availability honestly;
- never imply Finn is fully covered without API or RSS data;
- use swipe/dismissal feedback as ranking signal, not as factual CV evidence;
- explain why a match is recommended or weak.

### Source Suggestions

Function: `suggest-source-feeds`.

Input:

- profile and CV;
- structured interest signals;
- swipe feedback;
- strong existing matches.

Output:

- suggested Finn job searches with query, optional location, confidence, reason, and search URL.

Desired behavior:

- be enabled by default so the product feels automatic after onboarding;
- suggest concrete searches the user can edit, pause, dismiss, or open in Finn;
- avoid broad "all jobs" crawling;
- make it easy to connect an RSS URL from a saved Finn search when the user has one.

### Application Generation

Function: `generate-application`.

Input:

- job;
- profile;
- style guide;
- active CV template.

Output:

- full cover-letter draft in markdown;
- CV notes;
- chosen CV style.

Desired behavior:

- write in Norwegian unless the user/app later supports another language;
- avoid cliches;
- use 3-5 concrete paragraphs;
- connect real experience to job needs;
- avoid unsupported claims;
- produce a draft the user can edit, not a final truth.

### CV Tailoring

Function: `tailor-cv`.

Contract: follow [`AI_CV_HANDLING.md`](./AI_CV_HANDLING.md). CV output must be factual, classic, and PDF-safe.

Input:

- application;
- job;
- active CV template;
- profile.

Output:

- complete structured tailored CV snapshot;
- recommended section order;
- tailored intro;
- experiences to highlight;
- experiences to de-emphasize;
- skills to prioritize;
- rephrase suggestions;
- complete tailored CV markdown;
- notes.

Desired behavior:

- preserve CV facts;
- reframe rather than fabricate;
- explain choices briefly;
- prioritize relevance for the specific job;
- return structured sections with empty arrays instead of placeholder objects;
- keep tailored bullets and descriptions concise enough for a standard CV PDF.

### Application Editing

Function: `edit-application`.

Input:

- current application text;
- natural-language instruction;
- optional selected text;
- job context.

Output:

- complete updated application text.

Desired behavior:

- return only the updated text;
- keep line breaks and structure unless asked;
- if selection is provided, only modify that section but return the full document;
- preserve language;
- avoid adding facts.

### CV Import

Function: `import-cv`.

Contract: follow [`AI_CV_HANDLING.md`](./AI_CV_HANDLING.md). Import is extraction, not creative rewriting.

Input:

- pasted text or PDF.

Output:

- structured CV JSON.

Desired behavior:

- preserve original language;
- extract only present information;
- normalize dates where possible;
- use empty arrays for missing sections;
- return JSON only;
- keep contact fields as plain text;
- never return `[{}]` or malformed skill groups.

### Plan Generation

Function: `generate-plan`.

Input:

- target job date;
- weekly application pace;
- current profile and recent activity.

Output:

- main goal;
- weekly milestones.

Desired behavior:

- be realistic;
- account for available discovered jobs;
- focus early weeks on applications and later weeks on follow-up/interview prep;
- encourage progress without guilt.

### CV Style Selection

Function: `pick-cv-style` and style logic inside `generate-application`.

Available styles:

- `skandinavisk`: public sector, sustainability, healthcare, NGO.
- `korporat`: finance, law, consulting, large formal companies.
- `akademisk`: research, university, education.
- `startup`: scaleups, product, tech.
- `bold`: design, media, creative industries.

Desired behavior:

- choose based on job/company context;
- default to user's CV style when uncertain;
- allow user override.

## Tuning Strategy

The current implementation relies on Lovable AI Gateway prompts inside Edge Functions. To make tuning easier, move toward these layers:

1. **Central prompt registry**
   Keep system prompts and tool schemas in shared files or documented prompt modules instead of duplicating across functions.

2. **Prompt versioning**
   Track prompt version names in function output or logs, especially for parse/scoring behavior.

3. **User feedback**
   Store user feedback on job score quality, generated application quality, and CV tailoring quality.

4. **Evaluation set**
   Keep a small set of representative job ads and expected parse/score behavior.

5. **Model/provider boundary**
   Hide Lovable/OpenAI/Gemini-specific details behind a small AI client wrapper so deployment choices do not force product rewrites.

## Recommended AI Abstraction

Introduce a small backend AI layer over time:

- `aiClient`: provider-specific call wrapper.
- `prompts/jobParsing.ts`: job parse prompt and tool schema.
- `prompts/applicationWriting.ts`: application prompt and tool schema.
- `prompts/cvTailoring.ts`: CV prompt and tool schema.
- `prompts/planning.ts`: plan prompt and tool schema.
- `prompts/editing.ts`: edit prompt.

For Supabase Edge Functions, this can live as shared local modules imported by functions.

## Data to Add Later

Useful tuning tables:

- `ai_runs`: function name, prompt version, model, status, latency, user id, related entity id.
- `ai_feedback`: user id, entity type, entity id, rating, feedback text.
- `job_score_feedback`: job id, original score, user interest decision, user correction notes.

These should be added only when there is a clear product need.

## Failure Modes

Watch for:

- hallucinated experience;
- inflated scores;
- generic writing;
- too much enthusiasm;
- duplicated prompt logic;
- broken source scraping;
- silent AI rate-limit failures;
- service-role functions doing too much without auditability;
- accidental auto-drafting loops.

## Product Rule

The AI recruiter should make the user feel more capable, not less in control.
