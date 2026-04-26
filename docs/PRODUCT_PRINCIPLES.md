# Product Principles

## 1. The Dashboard Is the Workbench

The dashboard should answer "what is my job-search work today?" before anything else.

Prioritize:

- urgent deadlines;
- follow-ups due;
- interviews and calendar events;
- high-match jobs without drafts;
- new jobs from sources;
- weekly progress toward milestones.

Avoid making the dashboard a generic stats page. Stats are useful only when they drive action.

## 2. One Source of Truth Beats Many Documents

The app should centralize the material that normally gets scattered:

- profile and preferences;
- structured CV;
- applications;
- job ads;
- notes;
- deadlines;
- calendar events;
- source configuration.

When a feature creates another isolated place to store career information, reconsider it.

## 3. AI Helps, User Decides

AI should reduce friction and surface judgment, but the user remains responsible for applying, editing, and sending.

AI may:

- parse job ads;
- summarize and score opportunities;
- identify risks;
- suggest priority;
- generate drafts;
- tailor CV emphasis;
- propose weekly plans;
- rewrite selected text.

AI must not:

- invent experience;
- send applications without explicit user control;
- hide uncertainty;
- treat a score as truth;
- optimize for volume over fit.

## 4. Honest Tailoring Over Flattery

The writing style should be concrete, warm, and direct. It should avoid generic job-application language.

Good output:

- ties actual experience to the role;
- says less but means more;
- acknowledges fit honestly;
- uses the user's real CV and master profile.

Bad output:

- claims unsupported experience;
- uses vague enthusiasm;
- overstates certainty;
- sounds like a template.

## 5. Treat Job Search Like a Project

The product should support planning, cadence, and reflection.

Important concepts:

- target date;
- weekly application goal;
- milestones;
- pipeline health;
- deadlines;
- follow-ups;
- interviews;
- momentum.

The app should make progress visible without shaming the user.

## 6. Reduce Cognitive Load

Every screen should make the next action obvious.

Prefer:

- clear labels;
- compact but readable dashboards;
- visible status;
- filtered lists;
- direct actions;
- short onboarding steps.

Avoid:

- duplicating controls across screens without reason;
- burying important actions;
- long explanation text inside the app;
- making users configure everything before they can see value.

## 7. Norwegian First, International Later

The current app language and AI prompts are Norwegian. That is a strength for initial testing.

Default assumptions:

- Norwegian UI copy;
- Norwegian application writing;
- Norwegian job sources first;
- Finn and Arbeidsplassen as high-priority integrations;
- LinkedIn may require manual or semi-manual workflows.

If internationalization comes later, avoid hard-coding product logic to Norwegian sources where a generic source abstraction is easy.

## 8. Sources Must Be Transparent

Job discovery is messy because websites block scraping or change formats.

The app should show:

- where a job came from;
- when a source was last checked;
- whether a source is blocked;
- what manual fallback the user can take;
- how many jobs were found.

Silent source failure is worse than visible imperfection.

## 9. The Pipeline Is a Living System

Status should reflect the actual journey:

- discovered;
- considering;
- draft;
- sent;
- response received;
- interview;
- offer;
- rejected;
- withdrawn;
- archived.

When a user marks an application as sent, related job status, timeline events, and follow-up suggestions should stay aligned.

## 10. Build for the First Real User

The maker is also an active job seeker. Product decisions should be validated by daily use.

Prefer building the smallest version that helps with the current job search, then generalize only when repeated use proves the need.

Practical test:

Would this make tomorrow's job-search session clearer, faster, or calmer?
