// Atomic block components used by all CV layouts.
// Each "item" block sets wrap={false} so a single experience/education/skill
// entry is moved to the next page rather than split mid-content.
// Empty/incomplete items are filtered out so the AI-generated CV doesn't
// emit blank rows.

import { ReactNode } from "react";
import { View, Text, Image } from "@react-pdf/renderer";
import { CvStyleDef } from "../cvStyles";
import {
  CvData,
  CvExperience,
  CvEducation,
  CvSkillGroup,
  CvProject,
  CvCertification,
  CvLanguage,
  fmtRange,
} from "../types";
import { BaseStyles } from "./cvPdfStyles";

type WithStyles = { s: BaseStyles; style: CvStyleDef };

/* ---------- Filters that drop incomplete items ---------- */

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

export const Section = ({
  title,
  divider,
  children,
  s,
}: { title: string; divider?: boolean; children: ReactNode; s: BaseStyles }) => (
  <View style={s.section}>
    {/* break={false} keeps the title attached to the next sibling block */}
    <View wrap={false}>
      <Text style={[s.sectionTitle, divider ? s.sectionTitleDivider : {}]}>
        {title}
      </Text>
    </View>
    {children}
  </View>
);

export const ExperienceItem = ({
  item, s,
}: { item: CvExperience } & WithStyles) => {
  const bullets = (item.bullets ?? []).filter((b) => typeof b === "string" && b.trim());
  const techs = (item.technologies ?? []).filter((t) => typeof t === "string" && t.trim());
  return (
    <View wrap={false} style={{ marginTop: 8 }}>
      <View style={s.expRow}>
        <View style={{ flex: 1, paddingRight: 6 }}>
          {item.title ? <Text style={s.expTitle}>{item.title}</Text> : null}
          {(item.company || item.location) ? (
            <Text style={s.expCompany}>
              {item.company ?? ""}
              {item.location ? `${item.company ? " · " : ""}${item.location}` : ""}
            </Text>
          ) : null}
        </View>
        <Text style={s.expDate}>{fmtRange(item.start, item.end, item.current)}</Text>
      </View>
      {item.description ? <Text style={s.expDescription}>{item.description}</Text> : null}
      {bullets.length ? (
        <View style={{ marginTop: 3 }}>
          {bullets.map((b, j) => (
            <View key={j} style={s.bulletRow}>
              <Text style={s.bulletDot}>•</Text>
              <Text style={s.bulletText}>{b}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {techs.length ? <Text style={s.techLine}>{techs.join(" · ")}</Text> : null}
    </View>
  );
};

export const EducationItem = ({
  item, s,
}: { item: CvEducation } & WithStyles) => (
  <View wrap={false} style={[s.expRow, { marginTop: 6 }]}>
    <View style={{ flex: 1, paddingRight: 6 }}>
      {item.degree ? <Text style={s.expTitle}>{item.degree}</Text> : null}
      {item.institution ? <Text style={s.expCompany}>{item.institution}</Text> : null}
      {item.description ? (
        <Text style={[s.techLine, { marginTop: 1 }]}>{item.description}</Text>
      ) : null}
    </View>
    <Text style={s.expDate}>{fmtRange(item.start, item.end)}</Text>
  </View>
);

export const SkillsGroup = ({
  group, s,
}: { group: CvSkillGroup } & WithStyles) => (
  <View wrap={false} style={{ marginTop: 5 }}>
    {group.category ? <Text style={s.skillsCategory}>{group.category}</Text> : null}
    {group.items.length ? (
      <Text style={s.skillsItems}>{group.items.join(" · ")}</Text>
    ) : null}
  </View>
);

export const ProjectItem = ({
  item, s,
}: { item: CvProject } & WithStyles) => {
  const techs = (item.technologies ?? []).filter((t) => typeof t === "string" && t.trim());
  return (
    <View wrap={false} style={{ marginTop: 6 }}>
      {item.name ? <Text style={s.expTitle}>{item.name}</Text> : null}
      {item.description ? <Text style={s.expDescription}>{item.description}</Text> : null}
      {techs.length ? (
        <View style={s.pillsRow}>
          {techs.map((t, i) => (
            <Text key={i} style={s.pill}>{t}</Text>
          ))}
        </View>
      ) : null}
    </View>
  );
};

export const CertificationItem = ({
  item, s,
}: { item: CvCertification } & WithStyles) => (
  <View wrap={false} style={{ marginTop: 4 }}>
    <Text style={s.skillsItems}>
      {item.name ? <Text style={{ fontWeight: 600, color: s.expTitle.color }}>{item.name}</Text> : null}
      {item.issuer ? ` — ${item.issuer}` : ""}
      {item.date ? `, ${item.date}` : ""}
    </Text>
  </View>
);

export const LanguagesLine = ({
  langs, s,
}: { langs: CvLanguage[] } & { s: BaseStyles }) => (
  <Text style={s.languagesLine}>
    {langs
      .map((l) => (l.level ? `${l.name ?? ""} (${l.level})` : l.name ?? ""))
      .filter(Boolean)
      .join(" · ")}
  </Text>
);

export const ContactInline = ({
  cv, color, sep = "·", fontSize = 9,
}: { cv: CvData; color: string; sep?: string; fontSize?: number }) => {
  const parts = [cv.email, cv.phone, cv.location, cv.linkedin_url, cv.website_url].filter(
    (p): p is string => Boolean(p)
  );
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
      {parts.map((p, i) => (
        <Text key={i} style={{ fontSize, color }}>
          {i > 0 ? `  ${sep}  ` : ""}{p}
        </Text>
      ))}
    </View>
  );
};

export const ContactStack = ({
  cv, color, fontSize = 9.5,
}: { cv: CvData; color: string; fontSize?: number }) => {
  const parts = [cv.email, cv.phone, cv.location, cv.linkedin_url, cv.website_url].filter(
    (p): p is string => Boolean(p)
  );
  return (
    <View>
      {parts.map((p, i) => (
        <Text key={i} style={{ fontSize, color, lineHeight: 1.55 }}>{p}</Text>
      ))}
    </View>
  );
};

export const Avatar = ({
  url, size, ring, shape = "circle", s,
}: { url?: string | null; size: number; ring?: string; shape?: "circle" | "square"; s: BaseStyles }) => {
  if (!url) return null;
  return (
    <Image
      src={url}
      style={[
        s.avatar,
        {
          width: size,
          height: size,
          borderRadius: shape === "circle" ? size / 2 : 4,
          ...(ring ? { borderWidth: 1.5, borderColor: ring } : {}),
        },
      ]}
    />
  );
};
