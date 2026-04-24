// Renders a full A4 CV in any of the 5 style presets.
// Pure presentation – takes a CV object + a style id.

import { CSSProperties } from "react";
import { CvStyleDef, getStyle } from "./cvStyles";

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

const Experience = ({ items, style }: { items: NonNullable<CvData["experiences"]>; style: CvStyleDef }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
    {items.map((e, i) => (
      <div key={i}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 11.5, color: style.ink }}>{e.title}</div>
            <div style={{ fontSize: 10.5, color: style.accent }}>{e.company}{e.location ? ` · ${e.location}` : ""}</div>
          </div>
          <div style={{ fontSize: 9.5, color: style.muted, whiteSpace: "nowrap" }}>{fmtRange(e.start, e.end, e.current)}</div>
        </div>
        {e.description && <p style={{ fontSize: 10.5, margin: "4px 0 0", color: style.ink }}>{e.description}</p>}
        {!!e.bullets?.length && (
          <ul style={{ margin: "4px 0 0", paddingLeft: 16, fontSize: 10.5, color: style.ink, lineHeight: 1.5 }}>
            {e.bullets.map((b, j) => <li key={j}>{b}</li>)}
          </ul>
        )}
        {!!e.technologies?.length && (
          <div style={{ marginTop: 4, fontSize: 9.5, color: style.muted }}>
            {e.technologies.join(" · ")}
          </div>
        )}
      </div>
    ))}
  </div>
);

const Education = ({ items, style }: { items: NonNullable<CvData["education"]>; style: CvStyleDef }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
    {items.map((e, i) => (
      <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 11, color: style.ink }}>{e.degree}</div>
          <div style={{ fontSize: 10.5, color: style.accent }}>{e.institution}</div>
          {e.description && <div style={{ fontSize: 10, color: style.muted, marginTop: 2 }}>{e.description}</div>}
        </div>
        <div style={{ fontSize: 9.5, color: style.muted, whiteSpace: "nowrap" }}>{fmtRange(e.start, e.end)}</div>
      </div>
    ))}
  </div>
);

const SkillsBlock = ({ groups, style, vertical }: { groups: NonNullable<CvData["skills"]>; style: CvStyleDef; vertical?: boolean }) => (
  <div style={{ display: "flex", flexDirection: vertical ? "column" : "column", gap: 8 }}>
    {groups.map((g, i) => (
      <div key={i}>
        <div style={{ fontSize: 10, fontWeight: 600, color: style.ink, marginBottom: 3 }}>{g.category}</div>
        <div style={{ fontSize: 10, color: style.muted, lineHeight: 1.6 }}>{g.items.join(" · ")}</div>
      </div>
    ))}
  </div>
);

const Pills = ({ items, style }: { items: string[]; style: CvStyleDef }) => (
  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
    {items.map((it, i) => (
      <span key={i} style={{
        background: style.accentSoft, color: style.accent,
        fontSize: 9.5, padding: "2px 7px", borderRadius: 4, fontWeight: 500,
      }}>{it}</span>
    ))}
  </div>
);

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

      {!!cv.experiences?.length && (
        <Section title="Erfaring" color={style.accent}><Experience items={cv.experiences} style={style} /></Section>
      )}
      {!!cv.education?.length && (
        <Section title="Utdanning" color={style.accent}><Education items={cv.education} style={style} /></Section>
      )}
      {!!cv.skills?.length && (
        <Section title="Ferdigheter" color={style.accent}><SkillsBlock groups={cv.skills} style={style} /></Section>
      )}
      {!!cv.languages?.length && (
        <Section title="Språk" color={style.accent}>
          <div style={{ fontSize: 10.5, color: style.ink }}>
            {cv.languages.map((l, i) => `${l.name} (${l.level})`).join(" · ")}
          </div>
        </Section>
      )}
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
      {!!cv.experiences?.length && <Section title="Yrkeserfaring" color={style.accent} divider={style.accentSoft}><Experience items={cv.experiences} style={style} /></Section>}
      {!!cv.education?.length && <Section title="Utdanning" color={style.accent} divider={style.accentSoft}><Education items={cv.education} style={style} /></Section>}
      {!!cv.skills?.length && <Section title="Kompetanse" color={style.accent} divider={style.accentSoft}><SkillsBlock groups={cv.skills} style={style} /></Section>}
      {!!cv.languages?.length && (
        <Section title="Språk" color={style.accent} divider={style.accentSoft}>
          <div style={{ fontSize: 10.5 }}>{cv.languages.map((l) => `${l.name} (${l.level})`).join(" · ")}</div>
        </Section>
      )}
      {!!cv.certifications?.length && (
        <Section title="Sertifikater" color={style.accent} divider={style.accentSoft}>
          <div style={{ fontSize: 10.5, lineHeight: 1.6 }}>
            {cv.certifications.map((c, i) => (
              <div key={i}><strong>{c.name}</strong> — {c.issuer}{c.date ? `, ${c.date}` : ""}</div>
            ))}
          </div>
        </Section>
      )}
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
    {!!cv.experiences?.length && <Section title="Faglig erfaring" color={style.accent}><Experience items={cv.experiences} style={style} /></Section>}
    {!!cv.education?.length && <Section title="Utdanning" color={style.accent}><Education items={cv.education} style={style} /></Section>}
    {!!cv.projects?.length && (
      <Section title="Forskning og prosjekter" color={style.accent}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {cv.projects.map((p, i) => (
            <div key={i}>
              <div style={{ fontWeight: 600, fontSize: 11, color: style.ink }}>{p.name}</div>
              <div style={{ fontSize: 10.5, color: style.ink, lineHeight: 1.6 }}>{p.description}</div>
              {!!p.technologies?.length && <div style={{ fontSize: 9.5, color: style.muted, marginTop: 2 }}>{p.technologies.join(" · ")}</div>}
            </div>
          ))}
        </div>
      </Section>
    )}
    {!!cv.skills?.length && <Section title="Kompetanseområder" color={style.accent}><SkillsBlock groups={cv.skills} style={style} /></Section>}
    {!!cv.languages?.length && (
      <Section title="Språk" color={style.accent}>
        <div style={{ fontSize: 10.5 }}>{cv.languages.map((l) => `${l.name} (${l.level})`).join(" · ")}</div>
      </Section>
    )}
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
      {!!cv.experiences?.length && <Section title="Erfaring" color={style.accent}><Experience items={cv.experiences} style={style} /></Section>}
      {!!cv.projects?.length && (
        <Section title="Prosjekter" color={style.accent}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {cv.projects.map((p, i) => (
              <div key={i}>
                <div style={{ fontWeight: 600, fontSize: 11, color: style.ink }}>{p.name}</div>
                <div style={{ fontSize: 10.5, color: style.ink }}>{p.description}</div>
                {!!p.technologies?.length && <div style={{ marginTop: 3 }}><Pills items={p.technologies} style={style} /></div>}
              </div>
            ))}
          </div>
        </Section>
      )}
      {!!cv.education?.length && <Section title="Utdanning" color={style.accent}><Education items={cv.education} style={style} /></Section>}
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
      {!!cv.experiences?.length && <Section title="Erfaring" color={style.accent}><Experience items={cv.experiences} style={style} /></Section>}
      {!!cv.education?.length && <Section title="Utdanning" color={style.accent}><Education items={cv.education} style={style} /></Section>}
      {!!cv.skills?.length && <Section title="Ferdigheter" color={style.accent}><SkillsBlock groups={cv.skills} style={style} /></Section>}
      {!!cv.languages?.length && (
        <Section title="Språk" color={style.accent}>
          <div style={{ fontSize: 10.5 }}>{cv.languages.map((l) => `${l.name} (${l.level})`).join(" · ")}</div>
        </Section>
      )}
    </div>
  </div>
);
