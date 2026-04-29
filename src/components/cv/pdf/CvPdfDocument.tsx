// Stable vector-PDF CV renderer.
//
// The content flow stays conservative and page-break safe, but each preset has
// its own restrained visual profile so the CV can feel polished without
// becoming a decorative layout.

import { ReactNode } from "react";
import { Document, Page, View, Text, Image } from "@react-pdf/renderer";
import {
  CvData,
  CvSectionKey,
  SECTION_LABELS,
  resolveSectionOrder,
  fmtRange,
} from "../types";
import { CvStyleDef, getStyle } from "../cvStyles";
import { ensureFontsRegistered } from "./fonts";
import { fontFor } from "./cvPdfStyles";
import {
  validCertifications,
  validEducation,
  validExperiences,
  validLanguages,
  validProjects,
  validSkillGroups,
} from "./blocks";

ensureFontsRegistered();

type Props = { cv: CvData; styleId?: string | null };

export const CvPdfDocument = ({ cv, styleId }: Props) => {
  const style = getStyle(styleId);
  const s = classicStyles(style);
  const sections = renderSections(cv, s);
  const name = text(cv.full_name) || "Navn Navnesen";

  return (
    <Document
      title={`CV - ${name}`}
      author={name}
      subject="Curriculum Vitae"
      language="nb-NO"
    >
      <Page size="A4" wrap style={s.page}>
        <CvHeader cv={cv} s={s} />

        {text(cv.intro) ? (
          <View style={s.introBlock} minPresenceAhead={56}>
            <Text style={s.intro}>{text(cv.intro)}</Text>
          </View>
        ) : null}

        {sections}

        <Text
          fixed
          style={s.pageNumber}
          render={({ pageNumber, totalPages }) =>
            totalPages > 1 ? `${pageNumber} / ${totalPages}` : ""
          }
        />
      </Page>
    </Document>
  );
};

type ClassicStyles = ReturnType<typeof classicStyles>;

type HeaderMode = "classic" | "band" | "centered" | "panel" | "rail";
type IntroMode = "rail" | "panel" | "plain" | "quote";
type SectionMode = "rule" | "bar" | "plain" | "pill" | "block";

type VisualProfile = {
  headerMode: HeaderMode;
  introMode: IntroMode;
  sectionMode: SectionMode;
  pageBackground: string;
  surfaceBackground: string;
  headerBackground: string;
  headerText: string;
  headerMuted: string;
  headerBorder: string;
  sectionBackground: string;
  sectionBorder: string;
  dateBackground: string;
  skillBackground: string;
  itemBorderWidth: number;
  bodyInset: number;
  pagePaddingTop: number;
};

const classicStyles = (style: CvStyleDef) => {
  const font = fontFor(style);
  const accent = mutedAccent(style);
  const profile = visualProfile(style, accent);

  return {
    page: {
      fontFamily: font,
      backgroundColor: profile.pageBackground,
      color: "#161a1d",
      fontSize: 9.8,
      lineHeight: 1.42,
      paddingTop: profile.pagePaddingTop,
      paddingRight: 54,
      paddingBottom: 48,
      paddingLeft: 54,
    },
    header: {
      flexDirection: "row" as const,
      alignItems: "flex-start" as const,
      backgroundColor: profile.headerBackground,
      borderBottomWidth: profile.headerMode === "centered" || profile.headerMode === "classic" ? 1 : 0,
      borderBottomColor: profile.headerBorder,
      borderLeftWidth: profile.headerMode === "rail" ? 4 : 0,
      borderLeftColor: accent,
      paddingTop: profile.headerMode === "band" ? 22 : profile.headerMode === "panel" ? 18 : 0,
      paddingRight: profile.headerMode === "band" || profile.headerMode === "panel" || profile.headerMode === "rail" ? 20 : 0,
      paddingBottom: profile.headerMode === "band" ? 24 : profile.headerMode === "panel" ? 18 : 12,
      paddingLeft: profile.headerMode === "band" || profile.headerMode === "panel" ? 20 : profile.headerMode === "rail" ? 16 : 0,
      marginBottom: 14,
    },
    headerText: {
      flex: 1,
      paddingRight: 16,
      alignItems: profile.headerMode === "centered" ? "center" as const : "flex-start" as const,
    },
    name: {
      fontFamily: font,
      fontSize: profile.headerMode === "band" ? 24 : profile.headerMode === "centered" ? 21 : 23,
      fontWeight: 700,
      color: profile.headerText,
      lineHeight: 1.12,
      letterSpacing: 0,
      textAlign: profile.headerMode === "centered" ? "center" as const : "left" as const,
    },
    headline: {
      fontSize: 10.5,
      fontWeight: 500,
      color: profile.headerMode === "band" ? profile.headerMuted : accent,
      marginTop: 4,
      lineHeight: 1.35,
      textAlign: profile.headerMode === "centered" ? "center" as const : "left" as const,
    },
    contact: {
      fontSize: 8.6,
      color: profile.headerMuted,
      marginTop: 7,
      lineHeight: 1.45,
      textAlign: profile.headerMode === "centered" ? "center" as const : "left" as const,
    },
    introBlock: {
      backgroundColor: profile.introMode === "panel" ? profile.surfaceBackground : "transparent",
      borderLeftWidth: profile.introMode === "plain" ? 0 : profile.introMode === "quote" ? 1 : 3,
      borderLeftColor: accent,
      borderTopWidth: profile.introMode === "quote" ? 1 : 0,
      borderBottomWidth: profile.introMode === "quote" ? 1 : 0,
      borderTopColor: profile.sectionBorder,
      borderBottomColor: profile.sectionBorder,
      paddingTop: profile.introMode === "panel" || profile.introMode === "quote" ? 10 : 0,
      paddingRight: profile.introMode === "panel" ? 12 : 0,
      paddingBottom: profile.introMode === "panel" || profile.introMode === "quote" ? 10 : 0,
      paddingLeft: profile.introMode === "plain" ? 0 : 12,
      marginBottom: 2,
    },
    intro: {
      fontSize: 10,
      color: "#1f2937",
      lineHeight: 1.52,
      fontStyle: profile.introMode === "quote" ? "italic" as const : "normal" as const,
    },
    section: {
      marginTop: 14,
      paddingLeft: profile.bodyInset,
      borderLeftWidth: profile.itemBorderWidth,
      borderLeftColor: profile.sectionBorder,
    },
    sectionTitle: {
      fontSize: 9.2,
      fontWeight: 700,
      color: accent,
      textTransform: "uppercase" as const,
      letterSpacing: 0,
      backgroundColor: profile.sectionMode === "pill" || profile.sectionMode === "block" ? profile.sectionBackground : "transparent",
      borderBottomWidth: profile.sectionMode === "plain" ? 0.5 : profile.sectionMode === "bar" || profile.sectionMode === "rule" ? 1 : 0,
      borderBottomColor: profile.sectionBorder,
      borderLeftWidth: profile.sectionMode === "bar" ? 3 : 0,
      borderLeftColor: accent,
      paddingTop: profile.sectionMode === "pill" || profile.sectionMode === "block" ? 4 : 0,
      paddingRight: profile.sectionMode === "pill" || profile.sectionMode === "block" ? 8 : 0,
      paddingBottom: profile.sectionMode === "pill" || profile.sectionMode === "block" ? 4 : 3,
      paddingLeft: profile.sectionMode === "bar" ? 7 : profile.sectionMode === "pill" || profile.sectionMode === "block" ? 8 : 0,
      marginBottom: 4,
    },
    item: {
      marginTop: profile.sectionMode === "plain" ? 6 : 7,
    },
    itemHeader: {
      flexDirection: "row" as const,
      justifyContent: "space-between" as const,
      alignItems: "flex-start" as const,
    },
    itemMain: {
      flex: 1,
      paddingRight: 12,
    },
    itemTitle: {
      fontSize: 10.3,
      fontWeight: 700,
      color: style.ink,
      lineHeight: 1.28,
    },
    itemMeta: {
      fontSize: 9.4,
      color: accent,
      marginTop: 1,
      lineHeight: 1.35,
    },
    itemDate: {
      width: 92,
      textAlign: "right" as const,
      fontSize: 8.7,
      color: profile.sectionMode === "plain" ? "#6b7280" : accent,
      lineHeight: 1.35,
      backgroundColor: profile.dateBackground,
      paddingTop: profile.dateBackground === "transparent" ? 0 : 2,
      paddingBottom: profile.dateBackground === "transparent" ? 0 : 2,
      paddingRight: profile.dateBackground === "transparent" ? 0 : 4,
    },
    description: {
      fontSize: 9.7,
      color: "#1f2937",
      marginTop: 3,
      lineHeight: 1.45,
    },
    bulletRow: {
      flexDirection: "row" as const,
      marginTop: 2.2,
    },
    bulletDot: {
      width: 9,
      fontSize: 9.6,
      color: "#374151",
    },
    bulletText: {
      flex: 1,
      fontSize: 9.6,
      color: "#1f2937",
      lineHeight: 1.42,
    },
    smallLine: {
      fontSize: 8.8,
      color: style.muted,
      marginTop: 3,
      lineHeight: 1.38,
    },
    skillRow: {
      marginTop: 5,
      backgroundColor: profile.skillBackground,
      paddingTop: profile.skillBackground === "transparent" ? 0 : 4,
      paddingRight: profile.skillBackground === "transparent" ? 0 : 7,
      paddingBottom: profile.skillBackground === "transparent" ? 0 : 4,
      paddingLeft: profile.skillBackground === "transparent" ? 0 : 7,
    },
    skillText: {
      fontSize: 9.7,
      color: "#1f2937",
      lineHeight: 1.45,
    },
    skillCategory: {
      fontWeight: 700,
      color: "#111827",
    },
    pageNumber: {
      position: "absolute" as const,
      bottom: 24,
      right: 54,
      fontSize: 8,
      color: "#9ca3af",
    },
    photo: {
      width: 58,
      height: 58,
      borderRadius: 29,
      objectFit: "cover" as const,
      borderWidth: 1,
      borderColor: profile.headerMode === "band" ? "rgba(255,255,255,0.72)" : accent,
      backgroundColor: "#f3f4f6",
    },
    showHeaderPhoto: profile.headerMode !== "centered",
  };
};

const mutedAccent = (style: CvStyleDef) => {
  if (style.id === "startup") return "#4f46e5";
  if (style.id === "bold") return "#991b1b";
  if (style.id === "akademisk") return "#51406f";
  return style.accent;
};

const visualProfile = (style: CvStyleDef, accent: string): VisualProfile => {
  switch (style.id) {
    case "korporat":
      return {
        headerMode: "band",
        introMode: "rail",
        sectionMode: "bar",
        pageBackground: "#ffffff",
        surfaceBackground: style.accentSoft,
        headerBackground: accent,
        headerText: "#ffffff",
        headerMuted: "rgba(255,255,255,0.86)",
        headerBorder: style.accentSoft,
        sectionBackground: style.accentSoft,
        sectionBorder: "#d2ddeb",
        dateBackground: style.accentSoft,
        skillBackground: "transparent",
        itemBorderWidth: 0,
        bodyInset: 0,
        pagePaddingTop: 44,
      };
    case "akademisk":
      return {
        headerMode: "centered",
        introMode: "plain",
        sectionMode: "plain",
        pageBackground: "#ffffff",
        surfaceBackground: "#ffffff",
        headerBackground: "transparent",
        headerText: style.ink,
        headerMuted: style.muted,
        headerBorder: "#ddd8e8",
        sectionBackground: "transparent",
        sectionBorder: "#e7e2ef",
        dateBackground: "transparent",
        skillBackground: "transparent",
        itemBorderWidth: 0,
        bodyInset: 0,
        pagePaddingTop: 48,
      };
    case "startup":
      return {
        headerMode: "panel",
        introMode: "panel",
        sectionMode: "pill",
        pageBackground: style.background,
        surfaceBackground: style.accentSoft,
        headerBackground: "#f4efff",
        headerText: style.ink,
        headerMuted: style.muted,
        headerBorder: "#ded2ff",
        sectionBackground: "#f4efff",
        sectionBorder: "#ded2ff",
        dateBackground: "#f4efff",
        skillBackground: "#f8f5ff",
        itemBorderWidth: 2,
        bodyInset: 10,
        pagePaddingTop: 42,
      };
    case "bold":
      return {
        headerMode: "rail",
        introMode: "quote",
        sectionMode: "block",
        pageBackground: "#fffafa",
        surfaceBackground: style.accentSoft,
        headerBackground: "#fff1f1",
        headerText: style.ink,
        headerMuted: style.muted,
        headerBorder: "#f4c7c7",
        sectionBackground: "#fff1f1",
        sectionBorder: "#f1c5c5",
        dateBackground: "#fff1f1",
        skillBackground: "transparent",
        itemBorderWidth: 0,
        bodyInset: 0,
        pagePaddingTop: 42,
      };
    case "skandinavisk":
    default:
      return {
        headerMode: "classic",
        introMode: "panel",
        sectionMode: "rule",
        pageBackground: style.background,
        surfaceBackground: style.accentSoft,
        headerBackground: "transparent",
        headerText: style.ink,
        headerMuted: style.muted,
        headerBorder: "#cbd8d0",
        sectionBackground: "transparent",
        sectionBorder: "#cadbd2",
        dateBackground: "transparent",
        skillBackground: "transparent",
        itemBorderWidth: 2,
        bodyInset: 10,
        pagePaddingTop: 46,
      };
  }
};

const renderSections = (
  cv: CvData,
  s: ClassicStyles
): ReactNode[] => {
  const label = (k: CvSectionKey) => SECTION_LABELS[k];

  return resolveSectionOrder(cv.section_order)
    .map<ReactNode>((key) => {
      switch (key) {
        case "experiences": {
          const items = validExperiences(cv.experiences);
          if (!items.length) return null;
          return (
            <ClassicSection key={key} title={label(key)} s={s}>
              {items.map((item, i) => (
                <ExperienceBlock key={i} item={item} s={s} />
              ))}
            </ClassicSection>
          );
        }
        case "education": {
          const items = validEducation(cv.education);
          if (!items.length) return null;
          return (
            <ClassicSection key={key} title={label(key)} s={s}>
              {items.map((item, i) => (
                <EducationBlock key={i} item={item} s={s} />
              ))}
            </ClassicSection>
          );
        }
        case "skills": {
          const groups = validSkillGroups(cv.skills);
          if (!groups.length) return null;
          return (
            <ClassicSection key={key} title={label(key)} s={s}>
              {groups.map((group, i) => (
                <View key={i} style={s.skillRow} minPresenceAhead={28}>
                  <Text style={s.skillText}>
                    {group.category ? (
                      <Text style={s.skillCategory}>{text(group.category)}: </Text>
                    ) : null}
                    {group.items.map(text).filter(Boolean).join(", ")}
                  </Text>
                </View>
              ))}
            </ClassicSection>
          );
        }
        case "languages": {
          const langs = validLanguages(cv.languages);
          if (!langs.length) return null;
          return (
            <ClassicSection key={key} title={label(key)} s={s}>
              <Text style={[s.skillText, { marginTop: 5 }]}>
                {langs
                  .map((l) => {
                    const name = text(l.name);
                    const level = text(l.level);
                    return level ? `${name} (${level})` : name;
                  })
                  .filter(Boolean)
                  .join(", ")}
              </Text>
            </ClassicSection>
          );
        }
        case "projects": {
          const items = validProjects(cv.projects);
          if (!items.length) return null;
          return (
            <ClassicSection key={key} title={label(key)} s={s}>
              {items.map((item, i) => (
                <ProjectBlock key={i} item={item} s={s} />
              ))}
            </ClassicSection>
          );
        }
        case "certifications": {
          const items = validCertifications(cv.certifications);
          if (!items.length) return null;
          return (
            <ClassicSection key={key} title={label(key)} s={s}>
              {items.map((item, i) => (
                <CertificationBlock key={i} item={item} s={s} />
              ))}
            </ClassicSection>
          );
        }
        default:
          return null;
      }
    })
    .filter(Boolean);
};

const CvHeader = ({
  cv,
  s,
}: {
  cv: CvData;
  s: ClassicStyles;
}) => {
  const contacts = [
    text(cv.email),
    text(cv.phone),
    text(cv.location),
    formatUrl(cv.linkedin_url),
    formatUrl(cv.website_url),
  ].filter(Boolean);

  return (
    <View style={s.header} minPresenceAhead={90}>
      <View style={s.headerText}>
        <Text style={s.name}>{text(cv.full_name) || "Navn Navnesen"}</Text>
        {text(cv.headline) ? (
          <Text style={s.headline}>{text(cv.headline)}</Text>
        ) : null}
        {contacts.length ? (
          <Text style={s.contact}>{contacts.join(" | ")}</Text>
        ) : null}
      </View>
      {cv.photo_url && s.showHeaderPhoto ? (
        <Image src={cv.photo_url} style={s.photo} />
      ) : null}
    </View>
  );
};

const ClassicSection = ({
  title,
  children,
  s,
}: {
  title: string;
  children: ReactNode;
  s: ClassicStyles;
}) => (
  <View style={s.section} minPresenceAhead={76}>
    <View minPresenceAhead={76}>
      <Text style={s.sectionTitle}>{title}</Text>
    </View>
    {children}
  </View>
);

const ExperienceBlock = ({ item, s }: { item: any; s: ClassicStyles }) => {
  const date = fmtRange(text(item.start), text(item.end), item.current === true);
  const employer = [text(item.company), text(item.location)].filter(Boolean).join(", ");
  const bullets = stringList(item.bullets);
  const technologies = stringList(item.technologies);

  return (
    <View style={s.item} minPresenceAhead={62}>
      <View wrap={false} style={s.itemHeader}>
        <View style={s.itemMain}>
          {text(item.title) ? <Text style={s.itemTitle}>{text(item.title)}</Text> : null}
          {employer ? <Text style={s.itemMeta}>{employer}</Text> : null}
        </View>
        {date ? <Text style={s.itemDate}>{date}</Text> : null}
      </View>
      {text(item.description) ? (
        <Text style={s.description}>{text(item.description)}</Text>
      ) : null}
      {bullets.length ? (
        <View style={{ marginTop: 3 }}>
          {bullets.map((bullet, i) => (
            <View key={i} wrap={false} style={s.bulletRow}>
              <Text style={s.bulletDot}>•</Text>
              <Text style={s.bulletText}>{bullet}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {technologies.length ? (
        <Text style={s.smallLine}>Teknologi/verktøy: {technologies.join(", ")}</Text>
      ) : null}
    </View>
  );
};

const EducationBlock = ({ item, s }: { item: any; s: ClassicStyles }) => {
  const date = fmtRange(text(item.start), text(item.end));
  return (
    <View style={s.item} minPresenceAhead={46}>
      <View wrap={false} style={s.itemHeader}>
        <View style={s.itemMain}>
          {text(item.degree) ? <Text style={s.itemTitle}>{text(item.degree)}</Text> : null}
          {text(item.institution) ? <Text style={s.itemMeta}>{text(item.institution)}</Text> : null}
        </View>
        {date ? <Text style={s.itemDate}>{date}</Text> : null}
      </View>
      {text(item.description) ? (
        <Text style={s.smallLine}>{text(item.description)}</Text>
      ) : null}
    </View>
  );
};

const ProjectBlock = ({ item, s }: { item: any; s: ClassicStyles }) => {
  const technologies = stringList(item.technologies);
  return (
    <View style={s.item} minPresenceAhead={46}>
      {text(item.name) ? <Text style={s.itemTitle}>{text(item.name)}</Text> : null}
      {text(item.description) ? (
        <Text style={s.description}>{text(item.description)}</Text>
      ) : null}
      {technologies.length ? (
        <Text style={s.smallLine}>{technologies.join(", ")}</Text>
      ) : null}
    </View>
  );
};

const CertificationBlock = ({ item, s }: { item: any; s: ClassicStyles }) => {
  const parts = [text(item.name), text(item.issuer), text(item.date)].filter(Boolean);
  if (!parts.length) return null;
  return (
    <View style={s.skillRow} minPresenceAhead={28}>
      <Text style={s.skillText}>{parts.join(" - ")}</Text>
    </View>
  );
};

const text = (value: unknown): string => {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return "";
  return String(value).trim();
};

const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(text).filter(Boolean) : [];

const formatUrl = (value: unknown): string => {
  const raw = text(value);
  if (!raw) return "";
  return raw
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/$/, "");
};
