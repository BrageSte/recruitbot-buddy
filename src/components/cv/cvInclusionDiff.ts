import {
  CvData,
  CvSectionKey,
  DEFAULT_SECTION_ORDER,
  SECTION_LABELS,
  fmtRange,
} from "@/components/cv/types";

export type CvOriginalInclusionItem = {
  id: string;
  section: CvSectionKey;
  sectionLabel: string;
  label: string;
  detail?: string;
  source: unknown;
};

export type CvOriginalInclusionGroup = {
  section: CvSectionKey;
  label: string;
  items: CvOriginalInclusionItem[];
};

export function getOmittedOriginalCvItems(
  originalCv?: CvData | null,
  tailoredCv?: CvData | null,
): CvOriginalInclusionGroup[] {
  if (!originalCv) return [];
  const tailored = tailoredCv ?? {};

  const groups: CvOriginalInclusionGroup[] = [
    omittedGroup(
      "experiences",
      originalCv.experiences ?? [],
      new Set((tailored.experiences ?? []).map(experienceKey)),
      experienceKey,
      (item) => ({
        label: compact([item.title]).join(""),
        detail: compact([item.company, fmtRange(item.start, item.end, item.current)]).join(" · "),
      }),
    ),
    omittedGroup(
      "education",
      originalCv.education ?? [],
      new Set((tailored.education ?? []).map(educationKey)),
      educationKey,
      (item) => ({
        label: compact([item.degree]).join(""),
        detail: compact([item.institution, fmtRange(item.start, item.end)]).join(" · "),
      }),
    ),
    omittedSkills(originalCv, tailored),
    omittedGroup(
      "languages",
      originalCv.languages ?? [],
      new Set((tailored.languages ?? []).map(nameKey)),
      nameKey,
      (item) => ({ label: item.name, detail: item.level }),
    ),
    omittedGroup(
      "projects",
      originalCv.projects ?? [],
      new Set((tailored.projects ?? []).map(nameKey)),
      nameKey,
      (item) => ({ label: item.name, detail: item.description }),
    ),
    omittedGroup(
      "certifications",
      originalCv.certifications ?? [],
      new Set((tailored.certifications ?? []).map(nameKey)),
      nameKey,
      (item) => ({ label: item.name, detail: compact([item.issuer, item.date]).join(" · ") }),
    ),
  ].filter((group) => group.items.length);

  const order = new Map(DEFAULT_SECTION_ORDER.map((section, index) => [section, index]));
  return groups.sort((a, b) => (order.get(a.section) ?? 0) - (order.get(b.section) ?? 0));
}

export function formatOriginalCvItemsForInstruction(items: CvOriginalInclusionItem[]) {
  return JSON.stringify(
    items.map((item) => ({
      section: item.section,
      label: item.label,
      detail: item.detail ?? "",
      original: item.source,
    })),
    null,
    2,
  );
}

function omittedGroup<T>(
  section: CvSectionKey,
  originalItems: T[],
  tailoredKeys: Set<string>,
  keyFn: (item: T) => string,
  labelFn: (item: T) => { label: string; detail?: string },
): CvOriginalInclusionGroup {
  const items = originalItems
    .map((item, index) => {
      const key = keyFn(item);
      if (!key || tailoredKeys.has(key)) return null;
      const label = labelFn(item);
      return {
        id: `${section}:${key || index}`,
        section,
        sectionLabel: SECTION_LABELS[section],
        label: label.label,
        detail: label.detail,
        source: item,
      };
    })
    .filter((item): item is CvOriginalInclusionItem => Boolean(item));

  return { section, label: SECTION_LABELS[section], items };
}

function omittedSkills(originalCv: CvData, tailoredCv: CvData): CvOriginalInclusionGroup {
  const tailoredSkillKeys = new Set(
    (tailoredCv.skills ?? []).flatMap((group) =>
      (group.items ?? []).map((item) => skillKey(group.category, item)),
    ),
  );

  const items = (originalCv.skills ?? []).flatMap((group) =>
    (group.items ?? [])
      .map((item) => {
        const key = skillKey(group.category, item);
        if (!key || tailoredSkillKeys.has(key)) return null;
        return {
          id: `skills:${key}`,
          section: "skills" as const,
          sectionLabel: SECTION_LABELS.skills,
          label: item,
          detail: group.category,
          source: { category: group.category, item },
        };
      })
      .filter((entry): entry is CvOriginalInclusionItem => Boolean(entry)),
  );

  return { section: "skills", label: SECTION_LABELS.skills, items };
}

function experienceKey(item: { title?: string; company?: string; start?: string }) {
  return compact([item.title, item.company, item.start].map(normalize)).join("|");
}

function educationKey(item: { degree?: string; institution?: string }) {
  return compact([item.degree, item.institution].map(normalize)).join("|");
}

function nameKey(item: { name?: string }) {
  return normalize(item.name);
}

function skillKey(category?: string, item?: string) {
  return compact([normalize(category), normalize(item)]).join("|");
}

function normalize(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase().replace(/\s+/g, " ") : "";
}

function compact(values: Array<string | undefined | null>) {
  return values.filter((value): value is string => Boolean(value?.trim()));
}
