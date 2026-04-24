// Renders a cover-letter sheet matching the CV style: same accent, fonts and header band.

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CvStyleDef, getStyle } from "./cvStyles";
import { CvData } from "./CvDocument";

type Props = {
  cv: CvData;
  text: string;
  jobTitle?: string | null;
  company?: string | null;
  styleId?: string | null;
};

export const LetterDocument = ({ cv, text, jobTitle, company, styleId }: Props) => {
  const style: CvStyleDef = getStyle(styleId);
  const today = new Date().toLocaleDateString("no-NO", { year: "numeric", month: "long", day: "numeric" });
  return (
    <div
      className="cv-page"
      style={{
        fontFamily: style.bodyFont,
        background: style.background,
        color: style.ink,
        padding: 0,
      }}
    >
      {/* Matching header strip */}
      <div style={{ borderTop: `6px solid ${style.accent}`, padding: "20mm 22mm 10mm" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div>
            <h1 style={{ fontFamily: style.headingFont, fontSize: 22, fontWeight: 700, margin: 0, color: style.ink, letterSpacing: -0.3 }}>
              {cv.full_name || "Navn Navnesen"}
            </h1>
            {cv.headline && <div style={{ fontSize: 11, color: style.accent, marginTop: 2, fontWeight: 500 }}>{cv.headline}</div>}
          </div>
          <div style={{ fontSize: 10, color: style.muted, textAlign: "right", lineHeight: 1.6 }}>
            {[cv.email, cv.phone, cv.location].filter(Boolean).map((p, i) => <div key={i}>{p}</div>)}
            {cv.linkedin_url && <div>{cv.linkedin_url}</div>}
          </div>
        </div>
      </div>

      <div style={{ padding: "0 22mm 22mm" }}>
        <div style={{ fontSize: 10.5, color: style.muted, marginBottom: 18 }}>{today}</div>

        {(jobTitle || company) && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: style.ink, fontFamily: style.headingFont }}>
              Søknad{jobTitle ? `: ${jobTitle}` : ""}
            </div>
            {company && <div style={{ fontSize: 11, color: style.accent, marginTop: 2 }}>{company}</div>}
          </div>
        )}

        <div
          className="cv-letter-body"
          style={{ fontSize: 11, lineHeight: 1.65, color: style.ink }}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{text || "*Ingen tekst ennå.*"}</ReactMarkdown>
        </div>

        <div style={{ marginTop: 22, fontSize: 11, color: style.ink }}>
          Med vennlig hilsen
          <div style={{ fontFamily: style.headingFont, fontWeight: 600, marginTop: 18, color: style.accent }}>
            {cv.full_name || ""}
          </div>
        </div>
      </div>
    </div>
  );
};
