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

  applyPreservedArray(raw, next, original, "experiences", validExperiences, experienceKey);
  applyPreservedArray(raw, next, original, "education", validEducation, educationKey);
  applyPreservedSkillGroups(raw, next, original);
  applyPreservedArray(raw, next, original, "languages", validLanguages, nameKey);
  applyPreservedArray(raw, next, original, "projects", validProjects, nameKey);
  applyPreservedArray(raw, next, original, "certifications", validCertifications, nameKey);

  return next;
}

function applyPreservedArray(
  raw: Record<string, unknown>,
  target: any,
  original: any,
  key: CvSectionKey,
  validator: (value: unknown) => any[],
  keyFn: (item: any) => string,
) {
  if (!hasOwn(raw, key) || !Array.isArray(raw[key])) return;
  const valid = validator(raw[key]);
  const originalItems = arr(original[key]);

  if (valid.length === 0) {
    target[key] = originalItems;
    return;
  }

  target[key] = appendMissingByKey(valid, originalItems, keyFn);
}

function applyPreservedSkillGroups(raw: Record<string, unknown>, target: any, original: any) {
  if (!hasOwn(raw, "skills") || !Array.isArray(raw.skills)) return;
  const valid = validSkillGroups(raw.skills);
  const originalGroups = validSkillGroups(original.skills);

  if (valid.length === 0) {
    target.skills = originalGroups;
    return;
  }

  const merged = valid.map((group) => ({ ...group, items: [...group.items] }));
  const byCategory = new Map(merged.map((group) => [normalize(group.category), group]));

  for (const originalGroup of originalGroups) {
    const existing = byCategory.get(normalize(originalGroup.category));
    if (!existing) {
      merged.push(originalGroup);
      byCategory.set(normalize(originalGroup.category), originalGroup);
      continue;
    }

    const existingItems = new Set(existing.items.map(normalize));
    for (const item of originalGroup.items) {
      if (!existingItems.has(normalize(item))) {
        existing.items.push(item);
        existingItems.add(normalize(item));
      }
    }
  }

  target.skills = merged;
}

function appendMissingByKey(items: any[], originalItems: any[], keyFn: (item: any) => string) {
  const seen = new Set(items.map(keyFn).filter(Boolean));
  const merged = [...items];

  for (const item of originalItems) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    merged.push(item);
    seen.add(key);
  }

  return merged;
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

function normalize(value: unknown) {
  return str(value).toLowerCase().replace(/\s+/g, " ");
}

function experienceKey(item: any) {
  return [item?.title, item?.company, item?.start].map(normalize).join("|");
}

function educationKey(item: any) {
  return [item?.degree, item?.institution].map(normalize).join("|");
}

function nameKey(item: any) {
  return normalize(item?.name);
}
