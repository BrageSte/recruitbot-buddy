// Slim accent strip that renders only on page 2+ — keeps the colored chrome
// continuing through the whole document so backgrounds never "go white".
// The outer fixed View has no background so it leaves no artifact on page 1.

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
        <View style={s.continuationInner}>
          <Text style={s.continuationName}>{cv.full_name || ""}</Text>
          <Text style={s.continuationLabel}>CV</Text>
        </View>
      );
    }}
  />
);
