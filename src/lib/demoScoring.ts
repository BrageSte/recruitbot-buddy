export type DemoJob = {
  id: string;
  title: string;
  company: string;
  location: string;
  source: string;
  deadline: string;
  summary: string;
  keywords: string[];
};

export type ScoredDemoJob = DemoJob & {
  score: number;
  matchedKeywords: string[];
  reasons: string[];
};

const STOP = new Set(["og", "i", "med", "for", "som", "av", "til", "en", "et", "the", "and", "or", "of"]);

const tokenize = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9æøåéèüöä\s+#./-]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 2 && !STOP.has(t));

export const scoreDemoJobs = (
  cvText: string,
  goals: { roles?: string; location?: string; dealbreakers?: string },
  jobs: DemoJob[],
): ScoredDemoJob[] => {
  const cvTokens = new Set([...tokenize(cvText), ...tokenize(goals.roles ?? "")]);
  const locTokens = tokenize(goals.location ?? "");
  const dealTokens = tokenize(goals.dealbreakers ?? "");

  return jobs
    .map((job) => {
      const matched = job.keywords.filter((kw) => {
        const parts = tokenize(kw);
        return parts.some((p) => cvTokens.has(p));
      });
      const baseRatio = matched.length / Math.max(job.keywords.length, 1);
      let score = Math.round(40 + baseRatio * 55);

      const locText = job.location.toLowerCase();
      if (locTokens.length && locTokens.some((t) => locText.includes(t))) score += 6;
      if (dealTokens.some((t) => locText.includes(t) || job.summary.toLowerCase().includes(t))) score -= 18;

      score = Math.max(20, Math.min(98, score));

      const reasons: string[] = [];
      if (matched.length) reasons.push(`Treff på ${matched.slice(0, 4).join(", ")}`);
      if (locTokens.some((t) => locText.includes(t))) reasons.push(`Stedet matcher (${job.location})`);
      if (!reasons.length) reasons.push("Få direkte treff – kan likevel være verdt en titt");

      return { ...job, score, matchedKeywords: matched, reasons };
    })
    .sort((a, b) => b.score - a.score);
};

export const DEMO_KEYWORDS_MAX_LEN = 240;

export const buildDemoKeywords = (cvText: string, roles: string): string => {
  const roleTokens = tokenize(roles ?? "");
  const cvTokens = tokenize(cvText ?? "");
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const token of [...roleTokens, ...cvTokens]) {
    if (seen.has(token)) continue;
    seen.add(token);
    ordered.push(token);
  }

  let result = "";
  for (const token of ordered) {
    const next = result ? `${result} ${token}` : token;
    if (next.length > DEMO_KEYWORDS_MAX_LEN) break;
    result = next;
  }
  return result;
};

export const SAMPLE_CVS: { id: string; label: string; text: string }[] = [
  {
    id: "pm",
    label: "Produktleder",
    text: `Anna Berg – produktleder med 7 års erfaring fra B2B SaaS.
Roadmap, discovery, KPI-styring og tett samarbeid med kunder, design og data.
Erfaring fra analyseplattformer, A/B-tester og enterprise onboarding.
Verktøy: Figma, Looker, SQL, Jira. Snakker norsk og engelsk.`,
  },
  {
    id: "fe",
    label: "Frontend-utvikler",
    text: `Ola Nordmann – senior frontend-utvikler. 8 år med React, TypeScript og Tailwind.
Bygget design system og kundeportaler. Fokus på ytelse, tilgjengelighet og komponentbibliotek.
Tett samarbeid med UX og produkt. Erfaring med Vite, Next.js og testing.`,
  },
  {
    id: "cs",
    label: "Customer Success",
    text: `Maja Lie – Customer Success Manager. 5 år med enterprise SaaS-kunder i Norden.
Onboarding, kvartalsmøter, mersalg og tett dialog med produktteam.
Sterk på relasjon, kommunikasjon og strukturert oppfølging. Engelsk og norsk.`,
  },
];
