# AI CV Handling

This document is the product contract for AI-assisted CV work. A CV is the user's factual career record and the highest-trust artifact after the application text.

## Core Principle

The CV must be factual, conservative, readable, and export-safe. AI may structure, shorten, reorder, and rephrase existing facts, but it must not invent experience, education, certifications, technologies, outcomes, employment dates, titles, or personal qualities.

## Structured Data Contract

AI-generated CV JSON must match `cv_templates` and the shared `CvData` shape:

- `experiences[]`: real roles only. Keep `title`, `company`, dates, and location tied to the original role.
- `education[]`: real education only. Keep degree/institution/date context intact.
- `skills[]`: grouped categories with `items: string[]`. Never return `items` as text, objects, or mixed values.
- `languages[]`: `name` and `level` only.
- `projects[]`: real projects only, with concise descriptions.
- `certifications[]`: real certifications only.
- Empty sections must be `[]`, never `[{}]`.
- Contact fields must be plain text, not markdown.

## Writing Rules

- Use the CV's original language unless the user explicitly asks for another language.
- Prefer precise, concrete wording over slogans.
- Keep bullets short enough to scan. A good bullet is one specific contribution, responsibility, result, or context.
- Avoid filler such as "brenner for", "lidenskapelig", "dynamisk", "sterk teamplayer", and unsupported superlatives.
- Do not turn uncertain inference into fact. If a source says "worked with CRM", do not expand it to a named CRM unless present.
- Preserve chronology unless relevance calls for a different section order. Do not hide important date/context fields.

## Tailoring Rules

For a specific job, AI may:

- reorder sections and items for relevance;
- rewrite intro, descriptions, and bullets for clarity;
- prioritize existing skills that match the job;
- omit clearly irrelevant items from a tailored snapshot.

AI must not:

- add new skills because the job asks for them;
- upgrade responsibility level or seniority;
- fabricate metrics, clients, tools, certifications, or domain experience;
- remove identity/contact fields from the source CV;
- produce a marketing page or visual design brief instead of CV data.

## PDF Safety

The renderer is intentionally classic:

- no large colored sidebars, banners, or page-specific color changes;
- consistent margins, typography, and section spacing on every page;
- section headings must not be left alone at page bottoms;
- long roles, bullets, skills, and URLs must wrap instead of overlapping;
- page 2+ should feel like the same document, not a new template.

When changing CV rendering, verify with a multi-page CV containing:

- a long intro;
- at least three long experiences with bullets;
- long skill lists;
- LinkedIn or website URLs;
- education, languages, projects, and certifications.

## Function Guidance

- `import-cv` extracts facts into structured JSON. It should not polish aggressively.
- `tailor-cv` creates a complete tailored snapshot from the source CV. It may rephrase and reorder, but must preserve facts.
- `generate-application` may produce CV notes, but those notes are editorial suggestions only.
- `pick-cv-style` chooses a subtle style accent. It must not imply radically different CV layouts.

## Acceptance Checklist

Before considering CV generation healthy:

- exported PDF has no overlapping text;
- page breaks are clean and readable;
- page 2 has continuity with page 1;
- no empty placeholder rows appear;
- no unsupported claims are introduced;
- the CV still reads like a standard professional CV.
