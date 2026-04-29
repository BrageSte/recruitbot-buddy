// Font setup for @react-pdf/renderer.
//
// CV/letter PDFs use built-in PDF fonts for maximum compatibility with
// browsers, Preview, Poppler, and applicant tracking systems. Custom webfont
// embedding looked nicer, but made external PDF renderers less reliable.

import { Font } from "@react-pdf/renderer";

let registered = false;

export function ensureFontsRegistered() {
  if (registered) return;
  registered = true;

  // Keep normal words intact, but allow very long URLs/emails/tokens to wrap
  // so they cannot push contact lines or skill lists outside the page.
  Font.registerHyphenationCallback((word) => {
    if (!word || word.length <= 24) return [word];
    const pieces = word.split(/([/@._-])/).filter(Boolean);
    if (pieces.length > 1) return pieces;
    const chunks: string[] = [];
    for (let i = 0; i < word.length; i += 14) chunks.push(word.slice(i, i + 14));
    return chunks;
  });
}

export const PDF_FONT_SANS = "Helvetica";
export const PDF_FONT_SERIF = "Times-Roman";
