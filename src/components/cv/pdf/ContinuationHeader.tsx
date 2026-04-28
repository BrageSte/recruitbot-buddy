// Slim accent strip that renders only on page 2+ — keeps the colored chrome
// continuing through the whole document so backgrounds never "go white".

import { View, Text } from "@react-pdf/renderer";
import { CvStyleDef } from "../cvStyles";
import { CvData } from "../types";
import { BaseStyles } from "./cvPdfStyles";

export const ContinuationStrip = ({
  cv, style, s,
}: { cv: CvData; style: CvStyleDef; s: BaseStyles }) => (
  <View
    fixed
    style={s.continuation}
    render={({ pageNumber }) => {
      if (pageNumber <= 1) return null;
      return (
        <>
          <Text style={s.continuationName}>{cv.full_name || ""}</Text>
          <Text style={s.continuationLabel}>CV</Text>
        </>
      );
    }}
  />
);

// For sidebar layout: the sidebar is `fixed` and full-height. On page 1 it
// renders the full identity; on page 2+ it shrinks to a slim band at the top.
export const SidebarContinuation = ({
  cv, style, s,
}: { cv: CvData; style: CvStyleDef; s: BaseStyles }) => (
  <View
    fixed
    style={{
      position: "absolute",
      top: 0,
      left: 0,
      bottom: 0,
      width: "33%",
      backgroundColor: style.accent,
    }}
    render={({ pageNumber }) =>
      pageNumber > 1 ? (
        <View style={{ padding: 18 }}>
          <Text style={{ color: "#fff", fontSize: 11, fontWeight: 700 }}>
            {cv.full_name || ""}
          </Text>
          {cv.headline ? (
            <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 9, marginTop: 3 }}>
              {cv.headline}
            </Text>
          ) : null}
        </View>
      ) : null
    }
  />
);
