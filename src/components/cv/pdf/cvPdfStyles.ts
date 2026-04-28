// Centralised StyleSheet factory for CV PDF rendering.
// One factory per layout family — they share base typographic tokens but
// override layout-specific spacing/colors.

import { StyleSheet } from "@react-pdf/renderer";
import { CvStyleDef } from "../cvStyles";
import { PDF_FONT_SANS, PDF_FONT_SERIF } from "./fonts";

const sansLayouts = new Set(["minimal", "sidebar", "split"]);

const fontFor = (style: CvStyleDef) =>
  sansLayouts.has(style.layout) ? PDF_FONT_SANS : PDF_FONT_SERIF;

// Common typographic + spacing scale used across layouts.
export const buildBaseStyles = (style: CvStyleDef) => {
  const font = fontFor(style);
  return StyleSheet.create({
    page: {
      fontFamily: font,
      backgroundColor: style.background,
      color: style.ink,
      fontSize: 10,
      lineHeight: 1.45,
    },
    h1: {
      fontFamily: font,
      fontSize: 24,
      fontWeight: 700,
      color: style.ink,
      letterSpacing: -0.4,
    },
    headline: {
      fontSize: 11,
      color: style.accent,
      marginTop: 3,
      fontWeight: 500,
    },
    sectionTitle: {
      fontSize: 9,
      letterSpacing: 1.6,
      textTransform: "uppercase",
      color: style.accent,
      fontWeight: 600,
      marginBottom: 6,
    },
    sectionTitleDivider: {
      borderBottomWidth: 1,
      borderBottomColor: style.accentSoft,
      paddingBottom: 3,
    },
    section: {
      marginTop: 14,
    },
    expRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 8,
    },
    expTitle: {
      fontSize: 10.5,
      fontWeight: 600,
      color: style.ink,
    },
    expCompany: {
      fontSize: 10,
      color: style.accent,
      marginTop: 1,
    },
    expDate: {
      fontSize: 9,
      color: style.muted,
    },
    expDescription: {
      fontSize: 10,
      color: style.ink,
      marginTop: 3,
    },
    bulletRow: {
      flexDirection: "row",
      marginTop: 2,
    },
    bulletDot: {
      width: 9,
      fontSize: 10,
      color: style.ink,
    },
    bulletText: {
      flex: 1,
      fontSize: 10,
      color: style.ink,
    },
    techLine: {
      fontSize: 9,
      color: style.muted,
      marginTop: 3,
    },
    intro: {
      fontSize: 10,
      lineHeight: 1.55,
      color: style.ink,
      marginTop: 10,
    },
    contactRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      fontSize: 9,
      color: style.muted,
    },
    contactItem: {
      fontSize: 9,
      color: style.muted,
    },
    contactSep: {
      fontSize: 9,
      color: style.muted,
      marginHorizontal: 4,
    },
    skillsCategory: {
      fontSize: 10,
      fontWeight: 600,
      color: style.ink,
      marginBottom: 2,
    },
    skillsItems: {
      fontSize: 10,
      color: style.muted,
      lineHeight: 1.5,
    },
    languagesLine: {
      fontSize: 10,
      color: style.ink,
    },
    avatar: {
      objectFit: "cover",
      backgroundColor: "#eee",
    },
    pillsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 3,
      marginTop: 3,
    },
    pill: {
      backgroundColor: style.accentSoft,
      color: style.accent,
      fontSize: 8.5,
      paddingVertical: 1.5,
      paddingHorizontal: 5,
      borderRadius: 3,
      fontWeight: 500,
    },
    // Slim continuation header that appears on page 2+
    continuation: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      backgroundColor: style.accent,
      paddingVertical: 6,
      paddingHorizontal: 22,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    continuationName: {
      color: "#fff",
      fontSize: 9,
      fontWeight: 600,
      letterSpacing: 0.4,
    },
    continuationLabel: {
      color: "rgba(255,255,255,0.75)",
      fontSize: 8,
      letterSpacing: 1,
      textTransform: "uppercase",
    },
  });
};

export type BaseStyles = ReturnType<typeof buildBaseStyles>;
export { fontFor };
