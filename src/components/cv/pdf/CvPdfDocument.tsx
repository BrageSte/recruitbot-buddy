// Vector-PDF version of the CV document.
// One <Page> per layout — content flows naturally; blocks set wrap={false}
// so a single experience/education/skill entry is moved to the next page
// rather than split mid-content. A fixed continuation strip keeps the
// colored chrome present on every page.

import { ReactNode } from "react";
import { Document, Page, View, Text } from "@react-pdf/renderer";
import {
  CvData,
  CvSectionKey,
  SECTION_LABELS,
  resolveSectionOrder,
} from "../types";
import { CvStyleDef, getStyle } from "../cvStyles";
import { ensureFontsRegistered } from "./fonts";
import { buildBaseStyles, BaseStyles, fontFor } from "./cvPdfStyles";
import {
  Section,
  ExperienceItem,
  EducationItem,
  SkillsGroup,
  ProjectItem,
  CertificationItem,
  LanguagesLine,
  ContactInline,
  ContactStack,
  Avatar,
  validExperiences,
  validEducation,
  validSkillGroups,
  validProjects,
  validCertifications,
  validLanguages,
} from "./blocks";
import { ContinuationStrip, SidebarContinuation } from "./ContinuationHeader";

ensureFontsRegistered();

type Props = { cv: CvData; styleId?: string | null };

export const CvPdfDocument = ({ cv, styleId }: Props) => {
  const style = getStyle(styleId);
  switch (style.layout) {
    case "sidebar":      return <SidebarLayout cv={cv} style={style} />;
    case "header-band":  return <HeaderBandLayout cv={cv} style={style} />;
    case "centered":     return <CenteredLayout cv={cv} style={style} />;
    case "split":        return <SplitLayout cv={cv} style={style} />;
    default:             return <MinimalLayout cv={cv} style={style} />;
  }
};

/* ---------- Configurable section renderer ---------- */

type SectionOpts = {
  exclude?: CvSectionKey[];
  labels?: Partial<Record<CvSectionKey, string>>;
  divider?: boolean;
};

const renderSections = (
  cv: CvData,
  style: CvStyleDef,
  s: BaseStyles,
  opts: SectionOpts = {}
): ReactNode[] => {
  const order = resolveSectionOrder(cv.section_order, opts.exclude ?? []);
  const label = (k: CvSectionKey) => opts.labels?.[k] ?? SECTION_LABELS[k];

  return order
    .map<ReactNode>((key) => {
      switch (key) {
        case "experiences": {
          const items = validExperiences(cv.experiences);
          if (!items.length) return null;
          return (
            <Section key={key} title={label(key)} divider={opts.divider} s={s}>
              {items.map((e, i) => <ExperienceItem key={i} item={e} s={s} style={style} />)}
            </Section>
          );
        }
        case "education": {
          const items = validEducation(cv.education);
          if (!items.length) return null;
          return (
            <Section key={key} title={label(key)} divider={opts.divider} s={s}>
              {items.map((e, i) => <EducationItem key={i} item={e} s={s} style={style} />)}
            </Section>
          );
        }
        case "skills": {
          const items = validSkillGroups(cv.skills);
          if (!items.length) return null;
          return (
            <Section key={key} title={label(key)} divider={opts.divider} s={s}>
              {items.map((g, i) => <SkillsGroup key={i} group={g} s={s} style={style} />)}
            </Section>
          );
        }
        case "languages": {
          const items = validLanguages(cv.languages);
          if (!items.length) return null;
          return (
            <Section key={key} title={label(key)} divider={opts.divider} s={s}>
              <LanguagesLine langs={items} s={s} />
            </Section>
          );
        }
        case "projects": {
          const items = validProjects(cv.projects);
          if (!items.length) return null;
          return (
            <Section key={key} title={label(key)} divider={opts.divider} s={s}>
              {items.map((p, i) => <ProjectItem key={i} item={p} s={s} style={style} />)}
            </Section>
          );
        }
        case "certifications": {
          const items = validCertifications(cv.certifications);
          if (!items.length) return null;
          return (
            <Section key={key} title={label(key)} divider={opts.divider} s={s}>
              {items.map((c, i) => <CertificationItem key={i} item={c} s={s} style={style} />)}
            </Section>
          );
        }
        default:
          return null;
      }
    })
    .filter(Boolean);
};

/* ---------- LAYOUT 1 — Skandinavisk (minimal) ---------- */

const MinimalLayout = ({ cv, style }: { cv: CvData; style: CvStyleDef }) => {
  const s = buildBaseStyles(style);
  return (
    <Document>
      <Page size="A4" style={[s.page, { paddingTop: 60, paddingBottom: 50, paddingHorizontal: 56 }]}>
        <ContinuationStrip cv={cv} style={style} s={s} />

        <View style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingBottom: 12, borderBottomWidth: 1.5, borderBottomColor: style.accent }}>
          {cv.photo_url ? <Avatar url={cv.photo_url} size={62} ring={style.accent} s={s} /> : null}
          <View style={{ flex: 1 }}>
            <Text style={[s.h1, { fontWeight: 600 }]}>{cv.full_name || "Navn Navnesen"}</Text>
            {cv.headline ? <Text style={s.headline}>{cv.headline}</Text> : null}
            <View style={{ marginTop: 6 }}>
              <ContactInline cv={cv} color={style.muted} />
            </View>
          </View>
        </View>

        {cv.intro ? <Text style={s.intro}>{cv.intro}</Text> : null}
        {renderSections(cv, style, s)}
      </Page>
    </Document>
  );
};

/* ---------- LAYOUT 2 — Korporat (header-band) ---------- */

const HeaderBandLayout = ({ cv, style }: { cv: CvData; style: CvStyleDef }) => {
  const s = buildBaseStyles(style);
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <ContinuationStrip cv={cv} style={style} s={s} />

        <View style={{ backgroundColor: style.accent, paddingHorizontal: 56, paddingTop: 56, paddingBottom: 40, flexDirection: "row", alignItems: "center", gap: 16 }}>
          {cv.photo_url ? <Avatar url={cv.photo_url} size={68} ring="rgba(255,255,255,0.5)" shape="square" s={s} /> : null}
          <View style={{ flex: 1 }}>
            <Text style={[s.h1, { color: "#fff", letterSpacing: 0.2 }]}>{cv.full_name || "Navn Navnesen"}</Text>
            {cv.headline ? <Text style={[s.headline, { color: "rgba(255,255,255,0.95)" }]}>{cv.headline}</Text> : null}
            <View style={{ marginTop: 8 }}>
              <ContactInline cv={cv} color="rgba(255,255,255,0.85)" sep="|" />
            </View>
          </View>
        </View>

        <View style={{ paddingHorizontal: 56, paddingVertical: 36 }}>
          {cv.intro ? <Text style={[s.intro, { marginTop: 0 }]}>{cv.intro}</Text> : null}
          {renderSections(cv, style, s, {
            divider: true,
            labels: { experiences: "Yrkeserfaring", skills: "Kompetanse" },
          })}
        </View>
      </Page>
    </Document>
  );
};

/* ---------- LAYOUT 3 — Akademisk (centered) ---------- */

const CenteredLayout = ({ cv, style }: { cv: CvData; style: CvStyleDef }) => {
  const s = buildBaseStyles(style);
  return (
    <Document>
      <Page size="A4" style={[s.page, { paddingTop: 56, paddingBottom: 48, paddingHorizontal: 56 }]}>
        <ContinuationStrip cv={cv} style={style} s={s} />

        <View style={{ alignItems: "center", borderBottomWidth: 1, borderBottomColor: style.accent, paddingBottom: 12 }}>
          {cv.photo_url ? (
            <View style={{ marginBottom: 8 }}>
              <Avatar url={cv.photo_url} size={66} ring={style.accent} s={s} />
            </View>
          ) : null}
          <Text style={[s.h1, { color: style.accent, fontSize: 22 }]}>{cv.full_name || "Navn Navnesen"}</Text>
          {cv.headline ? <Text style={[s.headline, { fontStyle: "italic", color: style.muted }]}>{cv.headline}</Text> : null}
          <View style={{ marginTop: 6 }}>
            <ContactInline cv={cv} color={style.muted} />
          </View>
        </View>

        {cv.intro ? <Text style={s.intro}>{cv.intro}</Text> : null}
        {renderSections(cv, style, s, {
          labels: {
            experiences: "Faglig erfaring",
            skills: "Kompetanseområder",
            projects: "Forskning og prosjekter",
          },
        })}
      </Page>
    </Document>
  );
};

/* ---------- LAYOUT 4 — Startup (sidebar) ---------- */

const SidebarLayout = ({ cv, style }: { cv: CvData; style: CvStyleDef }) => {
  const s = buildBaseStyles(style);
  return (
    <Document>
      <Page
        size="A4"
        style={[
          s.page,
          {
            paddingLeft: "33%",
            paddingTop: 56,
            paddingBottom: 48,
            paddingRight: 36,
          },
        ]}
      >
        <SidebarContinuation cv={cv} style={style} s={s} />

        <View
          fixed
          style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "33%", padding: 24, backgroundColor: style.accent }}
          render={({ pageNumber }) => (pageNumber === 1 ? <SidebarPage1 cv={cv} style={style} s={s} /> : null)}
        />

        {cv.intro ? (
          <View>
            <Text style={s.sectionTitle}>Om meg</Text>
            <Text style={[s.intro, { marginTop: 0 }]}>{cv.intro}</Text>
          </View>
        ) : null}

        {renderSections(cv, style, s, { exclude: ["skills", "languages"] })}
      </Page>
    </Document>
  );
};

const SidebarPage1 = ({ cv, style, s }: { cv: CvData; style: CvStyleDef; s: BaseStyles }) => {
  const skills = validSkillGroups(cv.skills);
  const langs = validLanguages(cv.languages);
  return (
    <View>
      {cv.photo_url ? (
        <View style={{ marginBottom: 12 }}>
          <Avatar url={cv.photo_url} size={68} ring="rgba(255,255,255,0.4)" s={s} />
        </View>
      ) : null}
      <Text style={{ fontFamily: fontFor(style), fontSize: 16, fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>
        {cv.full_name || "Navn Navnesen"}
      </Text>
      {cv.headline ? (
        <Text style={{ fontSize: 9.5, color: "rgba(255,255,255,0.9)", marginTop: 5 }}>{cv.headline}</Text>
      ) : null}

      <View style={{ marginTop: 14 }}>
        <Text style={{ fontSize: 8.5, color: "rgba(255,255,255,0.8)", letterSpacing: 1.4, textTransform: "uppercase", marginBottom: 4 }}>
          Kontakt
        </Text>
        <ContactStack cv={cv} color="rgba(255,255,255,0.95)" fontSize={9} />
      </View>

      {skills.length ? (
        <View style={{ marginTop: 14 }}>
          <Text style={{ fontSize: 8.5, color: "rgba(255,255,255,0.8)", letterSpacing: 1.4, textTransform: "uppercase", marginBottom: 4 }}>
            Skills
          </Text>
          {skills.map((g, i) => (
            <View key={i} style={{ marginBottom: 6 }}>
              {g.category ? (
                <Text style={{ fontSize: 9, fontWeight: 600, color: "#fff", marginBottom: 1 }}>{g.category}</Text>
              ) : null}
              {g.items.length ? (
                <Text style={{ fontSize: 8.5, color: "rgba(255,255,255,0.85)", lineHeight: 1.5 }}>
                  {g.items.join(" · ")}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      {langs.length ? (
        <View style={{ marginTop: 14 }}>
          <Text style={{ fontSize: 8.5, color: "rgba(255,255,255,0.8)", letterSpacing: 1.4, textTransform: "uppercase", marginBottom: 4 }}>
            Språk
          </Text>
          {langs.map((l, i) => (
            <Text key={i} style={{ fontSize: 9, color: "#fff", marginTop: 1 }}>
              {l.name} <Text style={{ color: "rgba(255,255,255,0.7)" }}>· {l.level}</Text>
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
};

/* ---------- LAYOUT 5 — Bold (split) ---------- */

const SplitLayout = ({ cv, style }: { cv: CvData; style: CvStyleDef }) => {
  const s = buildBaseStyles(style);
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <ContinuationStrip cv={cv} style={style} s={s} />

        <View style={{ flexDirection: "row" }}>
          <View style={{ width: "45%", backgroundColor: style.accent, paddingHorizontal: 40, paddingVertical: 50, flexDirection: "row", alignItems: "center", gap: 12 }}>
            {cv.photo_url ? <Avatar url={cv.photo_url} size={68} ring="rgba(255,255,255,0.4)" shape="square" s={s} /> : null}
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 8, color: "rgba(255,255,255,0.85)", letterSpacing: 2.5, textTransform: "uppercase" }}>
                Curriculum Vitae
              </Text>
              <Text style={{ fontFamily: fontFor(style), fontSize: 24, fontWeight: 800, color: "#fff", marginTop: 6, lineHeight: 1.05, letterSpacing: -0.6 }}>
                {cv.full_name || "Navn Navnesen"}
              </Text>
              {cv.headline ? (
                <Text style={{ fontSize: 10, color: "rgba(255,255,255,0.95)", marginTop: 5 }}>{cv.headline}</Text>
              ) : null}
            </View>
          </View>
          <View style={{ width: "55%", backgroundColor: style.accentSoft, paddingHorizontal: 40, paddingVertical: 50 }}>
            <Text style={{ fontSize: 9, color: style.accent, letterSpacing: 1.6, textTransform: "uppercase", fontWeight: 600 }}>Kontakt</Text>
            <View style={{ marginTop: 6 }}>
              <ContactStack cv={cv} color={style.ink} fontSize={9.5} />
            </View>
          </View>
        </View>

        <View style={{ paddingHorizontal: 50, paddingVertical: 36 }}>
          {cv.intro ? (
            <View style={{ paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: style.accent }}>
              <Text style={{ fontSize: 11, lineHeight: 1.55, color: style.ink, fontStyle: "italic" }}>{cv.intro}</Text>
            </View>
          ) : null}
          {renderSections(cv, style, s)}
        </View>
      </Page>
    </Document>
  );
};
