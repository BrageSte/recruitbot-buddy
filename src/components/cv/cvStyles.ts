// Style presets for CV + matching letterhead.
// Each preset defines colors and fonts so the CV and the cover letter share visual identity.

export type CvStyleId = "skandinavisk" | "korporat" | "akademisk" | "startup" | "bold";

export type CvStyleDef = {
  id: CvStyleId;
  name: string;
  tagline: string;
  /** Tailwind/CSS color values – not from the design tokens, since the CV is a print artifact with its own palette. */
  accent: string;
  accentSoft: string;
  ink: string;
  muted: string;
  background: string;
  headingFont: string;
  bodyFont: string;
  layout: "sidebar" | "centered" | "header-band" | "minimal" | "split";
};

export const CV_STYLES: Record<CvStyleId, CvStyleDef> = {
  skandinavisk: {
    id: "skandinavisk",
    name: "Skandinavisk",
    tagline: "Lyst, rolig, mye luft – passer offentlig sektor og bærekraft.",
    accent: "#2f6f4f",
    accentSoft: "#e8f1ec",
    ink: "#1a1f1c",
    muted: "#5e6b64",
    background: "#fafaf7",
    headingFont: "'Inter', 'Helvetica Neue', sans-serif",
    bodyFont: "'Inter', 'Helvetica Neue', sans-serif",
    layout: "minimal",
  },
  korporat: {
    id: "korporat",
    name: "Korporat",
    tagline: "Klassisk og strukturert – for finans, jus og konsulent.",
    accent: "#0f3a6b",
    accentSoft: "#e6ecf4",
    ink: "#101828",
    muted: "#475467",
    background: "#ffffff",
    headingFont: "'Georgia', 'Times New Roman', serif",
    bodyFont: "'Georgia', 'Times New Roman', serif",
    layout: "header-band",
  },
  akademisk: {
    id: "akademisk",
    name: "Akademisk",
    tagline: "Tett tekst, mye innhold – passer forskning og utdanning.",
    accent: "#5b3a8c",
    accentSoft: "#efeaf6",
    ink: "#1f1a2c",
    muted: "#5a566b",
    background: "#ffffff",
    headingFont: "'Garamond', 'Georgia', serif",
    bodyFont: "'Garamond', 'Georgia', serif",
    layout: "centered",
  },
  startup: {
    id: "startup",
    name: "Startup",
    tagline: "Moderne, tech-aktig – passer scaleups og produkt.",
    accent: "#7c3aed",
    accentSoft: "#f1ebff",
    ink: "#0b0a1a",
    muted: "#52527a",
    background: "#fbfaff",
    headingFont: "'Inter', 'SF Pro Display', sans-serif",
    bodyFont: "'Inter', sans-serif",
    layout: "sidebar",
  },
  bold: {
    id: "bold",
    name: "Bold",
    tagline: "Stor tittel, sterk farge – passer kreative og media.",
    accent: "#dc2626",
    accentSoft: "#fde8e8",
    ink: "#1a0e0e",
    muted: "#5b4747",
    background: "#ffffff",
    headingFont: "'Inter', sans-serif",
    bodyFont: "'Inter', sans-serif",
    layout: "split",
  },
};

export const CV_STYLE_LIST = Object.values(CV_STYLES);

export const getStyle = (id: string | null | undefined): CvStyleDef =>
  CV_STYLES[(id as CvStyleId) ?? "skandinavisk"] ?? CV_STYLES.skandinavisk;
