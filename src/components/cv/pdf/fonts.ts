// Font registration for @react-pdf/renderer.
//
// We bundle Inter via @fontsource/inter so the sans-serif CV styles
// (Skandinavisk, Startup, Bold) keep their visual identity offline.
//
// The serif styles (Korporat = Georgia, Akademisk = Garamond) fall back to
// react-pdf's built-in Times-Roman — we don't bundle proprietary fonts.
// Visually close enough; can be replaced with licensed serif faces later.

import { Font } from "@react-pdf/renderer";

import Inter400 from "@fontsource/inter/files/inter-latin-400-normal.woff?url";
import Inter500 from "@fontsource/inter/files/inter-latin-500-normal.woff?url";
import Inter600 from "@fontsource/inter/files/inter-latin-600-normal.woff?url";
import Inter700 from "@fontsource/inter/files/inter-latin-700-normal.woff?url";
import Inter800 from "@fontsource/inter/files/inter-latin-800-normal.woff?url";

let registered = false;

export function ensureFontsRegistered() {
  if (registered) return;
  registered = true;

  Font.register({
    family: "Inter",
    fonts: [
      { src: Inter400, fontWeight: 400 },
      { src: Inter500, fontWeight: 500 },
      { src: Inter600, fontWeight: 600 },
      { src: Inter700, fontWeight: 700 },
      { src: Inter800, fontWeight: 800 },
    ],
  });

  // react-pdf hyphenates words by default; off looks more like the previous HTML output.
  Font.registerHyphenationCallback((word) => [word]);
}

export const PDF_FONT_SANS = "Inter";
export const PDF_FONT_SERIF = "Times-Roman";
