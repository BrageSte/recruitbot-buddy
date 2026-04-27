// Renders a full A4 CV in any of the 5 style presets.
// Pure presentation – takes a CV object + a style id.

import { CSSProperties } from "react";
import { CvStyleDef, getStyle } from "./cvStyles";

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
  experiences?: Array<{
    title: string;
    company: string;
    location?: string;
    start: string;
    end?: string;
    current?: boolean;
    description?: string;
    bullets?: string[];
    technologies?: string[];
  }>;
  education?: Array<{ degree: string; institution: string; start: string; end?: string; description?: string }>;
  skills?: Array<{ category: string; items: string[] }>;
  languages?: Array<{ name: string; level: string }>;
  projects?: Array<{ name: string; description: string; url?: string; technologies?: string[] }>;
  certifications?: Array<{ name: string; issuer: string; date?: string; url?: string }>;
};

const resolveOrder = (cv: CvData, exclude: CvSectionKey[] = []): CvSectionKey[] => {
  const raw = (cv.section_order ?? []).filter((k): k is CvSectionKey =>
    (DEFAULT_SECTION_ORDER as string[]).includes(k),
  );
  const seen = new Set(raw);
  const merged: CvSectionKey[] = [...raw];
  for (const k of DEFAULT_SECTION_ORDER) if (!seen.has(k)) merged.push(k);
  return merged.filter((k) => !exclude.includes(k));
};

type Props = { cv: CvData; styleId?: string | null };

export const CvDocument = ({ cv, styleId }: Props) => {
  const style = getStyle(styleId);
  switch (style.layout) {
    case "sidebar":
      return <SidebarLayout cv={cv} style={style} />;
    case "header-band":
      return <HeaderBandLayout cv={cv} style={style} />;
    case "centered":
      return <CenteredLayout cv={cv} style={style} />;
    case "split":
      return <SplitLayout cv={cv} style={style} />;
    default:
      return <MinimalLayout cv={cv} style={style} />;
  }
};

/* ---------- shared atoms ---------- */

const fmtRange = (start?: string, end?: string, current?: boolean) =>
  `${start ?? ""}${(start || end || current) ? " – " : ""}${current ? "nå" : end ?? ""}`;

const Avatar = ({
  url, size, ring, shape = "circle",
}: { url?: string | null; size: number; ring?: string; shape?: "circle" | "square" }) => {
  if (!url) return null;
  return (
    <img
      src={url}
      alt=""
      crossOrigin="anonymous"
      style={{
        width: size, height: size, objectFit: "cover", flexShrink: 0,
        borderRadius: shape === "circle" ? "50%" : 6,
        border: ring ? `2px solid ${ring}` : undefined,
        background: "#eee",
      }}
    />
  );
};

const ContactLine = ({ cv, color, sep = "·" }: { cv: CvData; color: string; sep?: string }) => {
  const parts = [cv.email, cv.phone, cv.location, cv.linkedin_url, cv.website_url].filter(Boolean);
  return (
    <div style={{ color, fontSize: 10, lineHeight: 1.5 }}>
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && <span style={{ margin: "0 6px" }}>{sep}</span>}
          {p}
        </span>
      ))}
    </div>
  );
};

const Section = ({ title, color, children, divider }: { title: string; color: string; children: any; divider?: string }) => (
  <section style={{ marginTop: 18 }}>
    <h2 style={{
      fontSize: 11, letterSpacing: 2, textTransform: "uppercase",
      color, margin: 0, marginBottom: 8, fontWeight: 600,
      borderBottom: divider ? `1px solid ${divider}` : undefined, paddingBottom: divider ? 4 : 0,
    }}>{title}</h2>
    {children}
  </section>
);

const Experience = ({ items, style }: { items: NonNullable<CvData["experiences"]>; style: CvStyleDef }) => {
  const valid = (items ?? []).filter((e) => e && (e.title || e.company));
  if (!valid.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {valid.map((e, i) => {
        const bullets = Array.isArray(e.bullets) ? e.bullets.filter((b) => typeof b === "string" && b.trim()) : [];
        const techs = Array.isArray(e.technologies) ? e.technologies.filter((t) => typeof t === "string" && t.trim()) : [];
        return (
          <div key={i}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 11.5, color: style.ink }}>{e.title ?? ""}</div>
                <div style={{ fontSize: 10.5, color: style.accent }}>
                  {e.company ?? ""}{e.location ? ` · ${e.location}` : ""}
                </div>
              </div>
              <div style={{ fontSize: 9.5, color: style.muted, whiteSpace: "nowrap" }}>{fmtRange(e.start, e.end, e.current)}</div>
            </div>
            {e.description && <p style={{ fontSize: 10.5, margin: "4px 0 0", color: style.ink }}>{e.description}</p>}
            {!!bullets.length && (
              <ul style={{ margin: "4px 0 0", paddingLeft: 16, fontSize: 10.5, color: style.ink, lineHeight: 1.5 }}>
                {bullets.map((b, j) => <li key={j}>{b}</li>)}
              </ul>
            )}
            {!!techs.length && (
              <div style={{ marginTop: 4, fontSize: 9.5, color: style.muted }}>
                {techs.join(" · ")}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

const Education = ({ items, style }: { items: NonNullable<CvData["education"]>; style: CvStyleDef }) => {
  const valid = (items ?? []).filter((e) => e && (e.degree || e.institution));
  if (!valid.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {valid.map((e, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 11, color: style.ink }}>{e.degree ?? ""}</div>
            <div style={{ fontSize: 10.5, color: style.accent }}>{e.institution ?? ""}</div>
            {e.description && <div style={{ fontSize: 10, color: style.muted, marginTop: 2 }}>{e.description}</div>}
          </div>
          <div style={{ fontSize: 9.5, color: style.muted, whiteSpace: "nowrap" }}>{fmtRange(e.start, e.end)}</div>
        </div>
      ))}
    </div>
  );
};

const SkillsBlock = ({ groups, style, vertical }: { groups: NonNullable<CvData["skills"]>; style: CvStyleDef; vertical?: boolean }) => {
  const valid = (groups ?? [])
    .map((g) => ({
      category: g?.category ?? "",
      items: Array.isArray(g?.items) ? g.items.filter((i) => typeof i === "string" && i.trim()) : [],
    }))
    .filter((g) => g.category || g.items.length);
  if (!valid.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: vertical ? "column" : "column", gap: 8 }}>
      {valid.map((g, i) => (
        <div key={i}>
          {g.category && <div style={{ fontSize: 10, fontWeight: 600, color: style.ink, marginBottom: 3 }}>{g.category}</div>}
          {!!g.items.length && (
            <div style={{ fontSize: 10, color: style.muted, lineHeight: 1.6 }}>{g.items.join(" · ")}</div>
          )}
        </div>
      ))}
    </div>
  );
};

const Pills = ({ items, style }: { items: string[]; style: CvStyleDef }) => {
  const valid = (items ?? []).filter((it) => typeof it === "string" && it.trim());
  if (!valid.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {valid.map((it, i) => (
        <span key={i} style={{
          background: style.accentSoft, color: style.accent,
          fontSize: 9.5, padding: "2px 7px", borderRadius: 4, fontWeight: 500,
        }}>{it}</span>
      ))}
    </div>
  );
};

/**
 * Render the configurable CV sections in the user-defined order.
 * `exclude` can be used by layouts that already render certain sections
 * elsewhere (e.g. Sidebar shows skills/languages in the aside).
 * `labels` lets a layout override the default heading text per section.
 */
const renderSections = (
  cv: CvData,
  style: CvStyleDef,
  opts?: {
    exclude?: CvSectionKey[];
    labels?: Partial<Record<CvSectionKey, string>>;
    divider?: string;
  },
) => {
  const order = resolveOrder(cv, opts?.exclude ?? []);
  const label = (k: CvSectionKey) => opts?.labels?.[k] ?? SECTION_LABELS[k];
  return order.map((key) => {
    switch (key) {
      case "experiences":
        if (!cv.experiences?.length) return null;
        return (
          <Section key={key} title={label(key)} color={style.accent} divider={opts?.divider}>
            <Experience items={cv.experiences} style={style} />
          </Section>
        );
      case "education":
        if (!cv.education?.length) return null;
        return (
          <Section key={key} title={label(key)} color={style.accent} divider={opts?.divider}>
            <Education items={cv.education} style={style} />
          </Section>
        );
      case "skills":
        if (!cv.skills?.length) return null;
        return (
          <Section key={key} title={label(key)} color={style.accent} divider={opts?.divider}>
            <SkillsBlock groups={cv.skills} style={style} />
          </Section>
        );
      case "languages": {
        const langs = (cv.languages ?? []).filter((l) => l && (l.name || l.level));
        if (!langs.length) return null;
        return (
          <Section key={key} title={label(key)} color={style.accent} divider={opts?.divider}>
            <div style={{ fontSize: 10.5, color: style.ink }}>
              {langs.map((l) => l.level ? `${l.name ?? ""} (${l.level})` : (l.name ?? "")).filter(Boolean).join(" · ")}
            </div>
          </Section>
        );
      }
      case "projects": {
        const projects = (cv.projects ?? []).filter((p) => p && (p.name || p.description));
        if (!projects.length) return null;
        return (
          <Section key={key} title={label(key)} color={style.accent} divider={opts?.divider}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {projects.map((p, i) => (
                <div key={i}>
                  {p.name && <div style={{ fontWeight: 600, fontSize: 11, color: style.ink }}>{p.name}</div>}
                  {p.description && <div style={{ fontSize: 10.5, color: style.ink, lineHeight: 1.6 }}>{p.description}</div>}
                  {!!p.technologies?.length && (
                    <div style={{ marginTop: 3 }}><Pills items={p.technologies} style={style} /></div>
                  )}
                </div>
              ))}
            </div>
          </Section>
        );
      }
      case "certifications": {
        const certs = (cv.certifications ?? []).filter((c) => c && (c.name || c.issuer));
        if (!certs.length) return null;
        return (
          <Section key={key} title={label(key)} color={style.accent} divider={opts?.divider}>
            <div style={{ fontSize: 10.5, lineHeight: 1.6, color: style.ink }}>
              {certs.map((c, i) => (
                <div key={i}><strong>{c.name ?? ""}</strong>{c.issuer ? ` — ${c.issuer}` : ""}{c.date ? `, ${c.date}` : ""}</div>
              ))}
            </div>
          </Section>
        );
      }
      default:
        return null;
    }
  });
};

/* ---------- LAYOUT 1 — Skandinavisk (minimal) ---------- */

const MinimalLayout = ({ cv, style }: { cv: CvData; style: CvStyleDef }) => {
  const baseStyle: CSSProperties = {
    fontFamily: style.bodyFont, background: style.background, color: style.ink,
    padding: "24mm 22mm",
  };
  return (
    <div className="cv-page" style={baseStyle}>
      <header style={{ borderBottom: `2px solid ${style.accent}`, paddingBottom: 14, marginBottom: 6, display: "flex", gap: 18, alignItems: "center" }}>
        {cv.photo_url && <Avatar url={cv.photo_url} size={78} ring={style.accent} />}
        <div style={{ flex: 1 }}>
          <h1 style={{ fontFamily: style.headingFont, fontSize: 30, fontWeight: 600, margin: 0, letterSpacing: -0.5, color: style.ink }}>
            {cv.full_name || "Navn Navnesen"}
          </h1>
          {cv.headline && <div style={{ fontSize: 13, color: style.accent, marginTop: 4, fontWeight: 500 }}>{cv.headline}</div>}
          <div style={{ marginTop: 10 }}><ContactLine cv={cv} color={style.muted} /></div>
        </div>
      </header>

      {cv.intro && <p style={{ fontSize: 11, lineHeight: 1.6, marginTop: 14, color: style.ink }}>{cv.intro}</p>}

      {renderSections(cv, style)}
    </div>
  );
};

/* ---------- LAYOUT 2 — Korporat (header-band) ---------- */

const HeaderBandLayout = ({ cv, style }: { cv: CvData; style: CvStyleDef }) => (
  <div className="cv-page" style={{ fontFamily: style.bodyFont, background: style.background, color: style.ink }}>
    <div style={{ background: style.accent, color: "#fff", padding: "22mm 22mm 16mm", display: "flex", gap: 20, alignItems: "center" }}>
      {cv.photo_url && <Avatar url={cv.photo_url} size={88} ring="rgba(255,255,255,0.5)" shape="square" />}
      <div style={{ flex: 1 }}>
        <h1 style={{ fontFamily: style.headingFont, fontSize: 30, fontWeight: 700, margin: 0, letterSpacing: 0.3 }}>
          {cv.full_name || "Navn Navnesen"}
        </h1>
        {cv.headline && <div style={{ fontSize: 13, marginTop: 4, opacity: 0.95 }}>{cv.headline}</div>}
        <div style={{ marginTop: 12, color: "rgba(255,255,255,0.85)" }}>
          <ContactLine cv={cv} color="rgba(255,255,255,0.85)" sep="|" />
        </div>
      </div>
    </div>
    <div style={{ padding: "16mm 22mm 22mm" }}>
      {cv.intro && (
        <p style={{ fontSize: 11, lineHeight: 1.6, color: style.ink, marginTop: 0 }}>
          {cv.intro}
        </p>
      )}
      {renderSections(cv, style, {
        divider: style.accentSoft,
        labels: { experiences: "Yrkeserfaring", skills: "Kompetanse" },
      })}
    </div>
  </div>
);

/* ---------- LAYOUT 3 — Akademisk (centered) ---------- */

const CenteredLayout = ({ cv, style }: { cv: CvData; style: CvStyleDef }) => (
  <div className="cv-page" style={{ fontFamily: style.bodyFont, background: style.background, color: style.ink, padding: "22mm" }}>
    <header style={{ textAlign: "center", borderBottom: `1px solid ${style.accent}`, paddingBottom: 12 }}>
      {cv.photo_url && (
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
          <Avatar url={cv.photo_url} size={84} ring={style.accent} />
        </div>
      )}
      <h1 style={{ fontFamily: style.headingFont, fontSize: 28, fontWeight: 700, margin: 0, color: style.accent }}>
        {cv.full_name || "Navn Navnesen"}
      </h1>
      {cv.headline && <div style={{ fontSize: 12, fontStyle: "italic", color: style.muted, marginTop: 4 }}>{cv.headline}</div>}
      <div style={{ marginTop: 8, display: "flex", justifyContent: "center" }}>
        <ContactLine cv={cv} color={style.muted} />
      </div>
    </header>
    {cv.intro && (
      <p style={{ fontSize: 11, lineHeight: 1.7, marginTop: 14, textAlign: "justify", color: style.ink }}>{cv.intro}</p>
    )}
    {renderSections(cv, style, {
      labels: {
        experiences: "Faglig erfaring",
        projects: "Forskning og prosjekter",
        skills: "Kompetanseområder",
      },
    })}
  </div>
);

/* ---------- LAYOUT 4 — Startup (sidebar) ---------- */

const SidebarLayout = ({ cv, style }: { cv: CvData; style: CvStyleDef }) => (
  <div className="cv-page" style={{ fontFamily: style.bodyFont, background: style.background, color: style.ink, display: "flex" }}>
    <aside style={{ width: "33%", background: style.accent, color: "#fff", padding: "22mm 14mm", boxSizing: "border-box" }}>
      {cv.photo_url && (
        <div style={{ marginBottom: 14 }}>
          <Avatar url={cv.photo_url} size={96} ring="rgba(255,255,255,0.4)" />
        </div>
      )}
      <h1 style={{ fontFamily: style.headingFont, fontSize: 22, fontWeight: 700, margin: 0, lineHeight: 1.2 }}>
        {cv.full_name || "Navn Navnesen"}
      </h1>
      {cv.headline && <div style={{ fontSize: 11.5, marginTop: 6, opacity: 0.9 }}>{cv.headline}</div>}

      <div style={{ marginTop: 18 }}>
        <h3 style={{ fontSize: 9.5, letterSpacing: 1.5, textTransform: "uppercase", opacity: 0.8, margin: "0 0 6px" }}>Kontakt</h3>
        <div style={{ fontSize: 10, lineHeight: 1.7 }}>
          {[cv.email, cv.phone, cv.location, cv.linkedin_url, cv.website_url].filter(Boolean).map((p, i) => (
            <div key={i} style={{ wordBreak: "break-all" }}>{p}</div>
          ))}
        </div>
      </div>

      {!!cv.skills?.length && (
        <div style={{ marginTop: 18 }}>
          <h3 style={{ fontSize: 9.5, letterSpacing: 1.5, textTransform: "uppercase", opacity: 0.8, margin: "0 0 6px" }}>Skills</h3>
          {cv.skills.map((g, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 600, marginBottom: 2 }}>{g.category}</div>
              <div style={{ fontSize: 9.5, opacity: 0.85, lineHeight: 1.5 }}>{g.items.join(" · ")}</div>
            </div>
          ))}
        </div>
      )}

      {!!cv.languages?.length && (
        <div style={{ marginTop: 18 }}>
          <h3 style={{ fontSize: 9.5, letterSpacing: 1.5, textTransform: "uppercase", opacity: 0.8, margin: "0 0 6px" }}>Språk</h3>
          <div style={{ fontSize: 10, lineHeight: 1.6 }}>
            {cv.languages.map((l, i) => <div key={i}>{l.name} <span style={{ opacity: 0.7 }}>· {l.level}</span></div>)}
          </div>
        </div>
      )}
    </aside>

    <main style={{ flex: 1, padding: "22mm 18mm", boxSizing: "border-box" }}>
      {cv.intro && (
        <section>
          <h2 style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: style.accent, margin: "0 0 6px", fontWeight: 600 }}>Om meg</h2>
          <p style={{ fontSize: 11, lineHeight: 1.6, color: style.ink, margin: 0 }}>{cv.intro}</p>
        </section>
      )}
      {renderSections(cv, style, { exclude: ["skills", "languages"] })}
    </main>
  </div>
);

/* ---------- LAYOUT 5 — Bold (split) ---------- */

const SplitLayout = ({ cv, style }: { cv: CvData; style: CvStyleDef }) => (
  <div className="cv-page" style={{ fontFamily: style.bodyFont, background: style.background, color: style.ink }}>
    <header style={{ display: "flex", alignItems: "stretch" }}>
      <div style={{ background: style.accent, color: "#fff", padding: "20mm 16mm", flex: "0 0 45%", boxSizing: "border-box", display: "flex", gap: 14, alignItems: "center" }}>
        {cv.photo_url && <Avatar url={cv.photo_url} size={92} ring="rgba(255,255,255,0.4)" shape="square" />}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, letterSpacing: 3, textTransform: "uppercase", opacity: 0.85 }}>Curriculum Vitae</div>
          <h1 style={{ fontFamily: style.headingFont, fontSize: 32, fontWeight: 800, margin: "8px 0 0", lineHeight: 1.05, letterSpacing: -1 }}>
            {cv.full_name || "Navn Navnesen"}
          </h1>
          {cv.headline && <div style={{ fontSize: 12.5, marginTop: 6, opacity: 0.95 }}>{cv.headline}</div>}
        </div>
      </div>
      <div style={{ background: style.accentSoft, padding: "20mm 16mm", flex: 1, boxSizing: "border-box" }}>
        <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: style.accent, fontWeight: 600 }}>Kontakt</div>
        <div style={{ marginTop: 8, fontSize: 10.5, lineHeight: 1.7, color: style.ink }}>
          {[cv.email, cv.phone, cv.location, cv.linkedin_url, cv.website_url].filter(Boolean).map((p, i) => (
            <div key={i} style={{ wordBreak: "break-all" }}>{p}</div>
          ))}
        </div>
      </div>
    </header>
    <div style={{ padding: "16mm 18mm 22mm" }}>
      {cv.intro && (
        <section>
          <p style={{ fontSize: 12, lineHeight: 1.6, color: style.ink, margin: 0, fontStyle: "italic", borderLeft: `3px solid ${style.accent}`, paddingLeft: 12 }}>
            {cv.intro}
          </p>
        </section>
      )}
      {renderSections(cv, style)}
    </div>
  </div>
);
