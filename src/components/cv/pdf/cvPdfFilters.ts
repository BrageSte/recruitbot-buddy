import {
  CvCertification,
  CvEducation,
  CvExperience,
  CvLanguage,
  CvProject,
  CvSkillGroup,
} from "../types";

export const validExperiences = (items?: CvExperience[]): CvExperience[] =>
  (items ?? []).filter((e) => e && (e.title || e.company));

export const validEducation = (items?: CvEducation[]): CvEducation[] =>
  (items ?? []).filter((e) => e && (e.degree || e.institution));

export const validSkillGroups = (groups?: CvSkillGroup[]): CvSkillGroup[] =>
  (groups ?? [])
    .map((g) => ({
      category: g?.category ?? "",
      items: Array.isArray(g?.items)
        ? g.items.filter((i) => typeof i === "string" && i.trim())
        : [],
    }))
    .filter((g) => g.category || g.items.length);

export const validProjects = (items?: CvProject[]): CvProject[] =>
  (items ?? []).filter((p) => p && (p.name || p.description));

export const validCertifications = (items?: CvCertification[]): CvCertification[] =>
  (items ?? []).filter((c) => c && (c.name || c.issuer));

export const validLanguages = (items?: CvLanguage[]): CvLanguage[] =>
  (items ?? []).filter((l) => l && (l.name || l.level));
