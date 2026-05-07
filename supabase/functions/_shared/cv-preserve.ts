export const ALLOWED_SECTIONS = [
  "experiences",
  "education",
  "skills",
  "languages",
  "projects",
  "certifications",
] as const;

export type CvSectionKey = (typeof ALLOWED_SECTIONS)[number];

export function arr(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

export function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function strArr(value: unknown): string[] {
  return arr(value).map(str).filter(Boolean);
}

export function cleanSectionOrder(value: unknown): string[] {
  return arr(value).filter((key) => typeof key === "string" && ALLOWED_SECTIONS.includes(key as CvSectionKey));
}

export function cvSnapshot(cv: any) {
  return {
    full_name: cv?.full_name ?? null,
    headline: cv?.headline ?? null,
    email: cv?.email ?? null,
    phone: cv?.phone ?? null,
    location: cv?.location ?? null,
    linkedin_url: cv?.linkedin_url ?? null,
    website_url: cv?.website_url ?? null,
    photo_url: cv?.photo_url ?? null,
    cv_style: cv?.cv_style ?? "skandinavisk",
    intro: cv?.intro ?? null,
    section_order: cleanSectionOrder(cv?.section_order).length ? cleanSectionOrder(cv?.section_order) : [...ALLOWED_SECTIONS],
    experiences: arr(cv?.experiences),
    education: arr(cv?.education),
    skills: arr(cv?.skills),
    languages: arr(cv?.languages),
    projects: arr(cv?.projects),
    certifications: arr(cv?.certifications),
  };
}

export function buildPreservedCvSnapshot(rawCv: unknown, originalCv: any, fallbackCv?: any) {
  const raw = isObject(rawCv) ? rawCv : {};
  const original = cvSnapshot(originalCv);
  const fallback = cvSnapshot(fallbackCv ?? originalCv);
  const next: any = {
    ...fallback,
    full_name: original.full_name,
    email: original.email,
    phone: original.phone,
    location: original.location,
    linkedin_url: original.linkedin_url,
    website_url: original.website_url,
    photo_url: original.photo_url,
    cv_style: original.cv_style,
  };

  const headline = str(raw.headline);
  if (headline) next.headline = headline;
  const intro = str(raw.intro);
  if (intro) next.intro = intro;

  applyTailoredArray(raw, next, "experiences", validExperiences);
  applyTailoredArray(raw, next, "education", validEducation);
  applyTailoredArray(raw, next, "skills", validSkillGroups);
  applyTailoredArray(raw, next, "languages", validLanguages);
  applyTailoredArray(raw, next, "projects", validProjects);
  applyTailoredArray(raw, next, "certifications", validCertifications);

  return next;
}

function applyTailoredArray(
  raw: Record<string, unknown>,
  target: any,
  key: CvSectionKey,
  validator: (value: unknown) => any[],
) {
  if (!hasOwn(raw, key) || !Array.isArray(raw[key])) return;
  const rawArray = raw[key] as unknown[];
  const valid = validator(rawArray);
  if (rawArray.length === 0 || valid.length > 0) target[key] = valid;
}

export function validExperiences(value: unknown) {
  return arr(value)
    .map((rawItem: any) => ({
      title: str(rawItem?.title),
      company: str(rawItem?.company),
      location: str(rawItem?.location) || undefined,
      start: str(rawItem?.start),
      end: str(rawItem?.end) || undefined,
      current: rawItem?.current === true ? true : undefined,
      description: str(rawItem?.description) || undefined,
      bullets: strArr(rawItem?.bullets),
      technologies: strArr(rawItem?.technologies),
    }))
    .filter((item) => item.title && item.company);
}

export function validEducation(value: unknown) {
  return arr(value)
    .map((rawItem: any) => ({
      degree: str(rawItem?.degree),
      institution: str(rawItem?.institution),
      start: str(rawItem?.start),
      end: str(rawItem?.end) || undefined,
      description: str(rawItem?.description) || undefined,
    }))
    .filter((item) => item.degree && item.institution);
}

export function validSkillGroups(value: unknown) {
  return arr(value)
    .map((rawGroup: any) => ({ category: str(rawGroup?.category), items: strArr(rawGroup?.items) }))
    .filter((group) => group.category && group.items.length);
}

export function validLanguages(value: unknown) {
  return arr(value)
    .map((rawItem: any) => ({ name: str(rawItem?.name), level: str(rawItem?.level) }))
    .filter((item) => item.name && item.level);
}

export function validProjects(value: unknown) {
  return arr(value)
    .map((rawItem: any) => ({
      name: str(rawItem?.name),
      description: str(rawItem?.description),
      url: str(rawItem?.url) || undefined,
      technologies: strArr(rawItem?.technologies),
    }))
    .filter((item) => item.name && item.description);
}

export function validCertifications(value: unknown) {
  return arr(value)
    .map((rawItem: any) => ({
      name: str(rawItem?.name),
      issuer: str(rawItem?.issuer),
      date: str(rawItem?.date) || undefined,
      url: str(rawItem?.url) || undefined,
    }))
    .filter((item) => item.name && item.issuer);
}

export function validRephrases(value: unknown) {
  return arr(value)
    .map((rawItem: any) => ({
      context: str(rawItem?.context),
      before: str(rawItem?.before),
      after: str(rawItem?.after),
    }))
    .filter((item) => item.context && (item.before || item.after));
}

function hasOwn(value: unknown, key: string) {
  return isObject(value) && Object.prototype.hasOwnProperty.call(value, key);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
