// Shared CV data shape used by all renderers (PDF + UI).

export type CvExperience = {
  title: string;
  company: string;
  location?: string;
  start: string;
  end?: string;
  current?: boolean;
  description?: string;
  bullets?: string[];
  technologies?: string[];
};

export type CvEducation = {
  degree: string;
  institution: string;
  start: string;
  end?: string;
  description?: string;
};

export type CvSkillGroup = { category: string; items: string[] };
export type CvLanguage = { name: string; level: string };
export type CvProject = {
  name: string;
  description: string;
  url?: string;
  technologies?: string[];
};
export type CvCertification = {
  name: string;
  issuer: string;
  date?: string;
  url?: string;
};

export type CvSectionKey =
  | "experiences"
  | "education"
  | "skills"
  | "languages"
  | "projects"
  | "certifications";

export const DEFAULT_SECTION_ORDER: CvSectionKey[] = [
  "experiences",
  "education",
  "skills",
  "languages",
  "projects",
  "certifications",
];

export const SECTION_LABELS: Record<CvSectionKey, string> = {
  experiences: "Erfaring",
  education: "Utdanning",
  skills: "Ferdigheter",
  languages: "Språk",
  projects: "Prosjekter",
  certifications: "Sertifikater",
};

export type CvData = {
  full_name?: string | null;
  headline?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  linkedin_url?: string | null;
  website_url?: string | null;
  photo_url?: string | null;
  intro?: string | null;
  section_order?: string[] | null;
  experiences?: CvExperience[];
  education?: CvEducation[];
  skills?: CvSkillGroup[];
  languages?: CvLanguage[];
  projects?: CvProject[];
  certifications?: CvCertification[];
};

export const fmtRange = (start?: string, end?: string, current?: boolean) =>
  `${start ?? ""}${start || end || current ? " – " : ""}${current ? "nå" : end ?? ""}`;

// Resolves a CV's section_order against DEFAULT_SECTION_ORDER, dropping unknown
// keys, appending any missing defaults, and excluding sections rendered elsewhere.
export const resolveSectionOrder = (
  sectionOrder: string[] | null | undefined,
  exclude: CvSectionKey[] = []
): CvSectionKey[] => {
  const raw = (sectionOrder ?? []).filter((k): k is CvSectionKey =>
    (DEFAULT_SECTION_ORDER as string[]).includes(k)
  );
  const seen = new Set(raw);
  const merged: CvSectionKey[] = [...raw];
  for (const k of DEFAULT_SECTION_ORDER) if (!seen.has(k)) merged.push(k);
  return merged.filter((k) => !exclude.includes(k));
};
