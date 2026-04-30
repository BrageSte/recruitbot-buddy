// Vector-PDF cover letter matching the active CV style.
// Includes a small markdown parser that handles paragraphs, headings (h1–h3),
// bullet lists, bold (**), and italic (*) — the 90% case for application letters.

import { ReactNode } from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { CvData } from "../types";
import { CvStyleDef, getStyle } from "../cvStyles";
import { ensureFontsRegistered } from "./fonts";
import { buildBaseStyles, fontFor } from "./cvPdfStyles";

ensureFontsRegistered();

type Props = {
  cv: CvData;
  text: string;
  jobTitle?: string | null;
  company?: string | null;
  styleId?: string | null;
};

export const LetterPdfDocument = ({ cv, text, jobTitle, company, styleId }: Props) => {
  const style = getStyle(styleId);
  const s = buildBaseStyles(style);
  const letter = buildLetterStyles(style);
  const today = new Date().toLocaleDateString("no-NO", { year: "numeric", month: "long", day: "numeric" });

  return (
    <Document>
      <Page size="A4" style={[s.page, letter.page]}>
        <View style={letter.header}>
          <View style={letter.headerRow}>
            <View style={letter.identity}>
              <Text style={letter.name}>{cv.full_name || "Navn Navnesen"}</Text>
              {cv.headline ? (
                <Text style={letter.headline}>{cv.headline}</Text>
              ) : null}
            </View>
            <View style={letter.contact}>
              {[cv.email, cv.phone, cv.location].filter(Boolean).map((p, i) => (
                <Text key={i} style={letter.contactItem}>{p}</Text>
              ))}
              {cv.linkedin_url ? (
                <Text style={letter.contactItem}>{cv.linkedin_url}</Text>
              ) : null}
            </View>
          </View>
        </View>

        <View style={letter.body}>
          <Text style={letter.date}>{today}</Text>

          {(jobTitle || company) ? (
            <View style={letter.subjectBlock}>
              <Text style={letter.subject}>
                Søknad{jobTitle ? `: ${jobTitle}` : ""}
              </Text>
              {company ? (
                <Text style={letter.company}>{company}</Text>
              ) : null}
            </View>
          ) : null}

          <MarkdownBody text={text || "*Ingen tekst ennå.*"} style={style} />

          <View style={letter.closing}>
            <Text style={letter.closingText}>Med vennlig hilsen</Text>
            <Text style={letter.signature}>
              {cv.full_name || ""}
            </Text>
          </View>
        </View>
      </Page>
    </Document>
  );
};

const buildLetterStyles = (style: CvStyleDef) => {
  const font = fontFor(style);

  return StyleSheet.create({
    page: {
      paddingBottom: 56,
    },
    header: {
      borderTopWidth: 4,
      borderTopColor: style.accent,
      borderBottomWidth: 1,
      borderBottomColor: style.accentSoft,
      paddingHorizontal: 56,
      paddingTop: 34,
      paddingBottom: 24,
    },
    headerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 18,
    },
    identity: {
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 0,
      paddingRight: 16,
    },
    name: {
      fontFamily: font,
      fontSize: 19,
      fontWeight: 700,
      color: style.ink,
      letterSpacing: 0,
      lineHeight: 1.18,
    },
    headline: {
      fontSize: 10.5,
      color: style.accent,
      marginTop: 6,
      fontWeight: 500,
      lineHeight: 1.35,
    },
    contact: {
      width: 168,
      alignItems: "flex-end",
      paddingTop: 2,
    },
    contactItem: {
      fontSize: 8.8,
      color: style.muted,
      lineHeight: 1.45,
      textAlign: "right",
    },
    body: {
      paddingHorizontal: 56,
      paddingTop: 16,
    },
    date: {
      fontSize: 9.5,
      color: style.muted,
      marginBottom: 18,
    },
    subjectBlock: {
      marginBottom: 16,
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: style.accentSoft,
    },
    subject: {
      fontFamily: font,
      fontSize: 12.5,
      fontWeight: 600,
      color: style.ink,
      lineHeight: 1.3,
    },
    company: {
      fontSize: 10,
      color: style.accent,
      marginTop: 3,
      lineHeight: 1.35,
    },
    closing: {
      marginTop: 24,
    },
    closingText: {
      fontSize: 10,
      color: style.ink,
    },
    signature: {
      fontFamily: font,
      fontWeight: 600,
      fontSize: 11,
      color: style.accent,
      marginTop: 14,
    },
  });
};

/* ---------- Minimal markdown → react-pdf parser ---------- */

const MarkdownBody = ({ text, style }: { text: string; style: CvStyleDef }) => {
  const blocks = parseBlocks(text);
  return (
    <View style={{ fontSize: 10.5, lineHeight: 1.6, color: style.ink }}>
      {blocks.map((block, i) => renderBlock(block, i, style))}
    </View>
  );
};

type Block =
  | { type: "p"; text: string }
  | { type: "h"; level: 1 | 2 | 3; text: string }
  | { type: "ul"; items: string[] };

function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let buffer: string[] = [];
  let listItems: string[] | null = null;

  const flushParagraph = () => {
    if (buffer.length) {
      blocks.push({ type: "p", text: buffer.join(" ") });
      buffer = [];
    }
  };
  const flushList = () => {
    if (listItems && listItems.length) {
      blocks.push({ type: "ul", items: listItems });
    }
    listItems = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: "h", level: heading[1].length as 1 | 2 | 3, text: heading[2] });
      continue;
    }
    const bullet = /^[-*+]\s+(.*)$/.exec(line);
    if (bullet) {
      flushParagraph();
      if (!listItems) listItems = [];
      listItems.push(bullet[1]);
      continue;
    }
    flushList();
    buffer.push(line.trim());
  }
  flushParagraph();
  flushList();
  return blocks;
}

function renderBlock(block: Block, key: number, style: CvStyleDef): ReactNode {
  switch (block.type) {
    case "h": {
      const sizes = { 1: 16, 2: 13, 3: 11 } as const;
      return (
        <Text
          key={key}
          style={{
            fontFamily: fontFor(style),
            fontSize: sizes[block.level],
            fontWeight: 600,
            color: style.ink,
            marginTop: block.level === 1 ? 14 : 10,
            marginBottom: 4,
          }}
        >
          {renderInline(block.text)}
        </Text>
      );
    }
    case "ul":
      return (
        <View key={key} style={{ marginVertical: 5 }}>
          {block.items.map((it, i) => (
            <View key={i} style={{ flexDirection: "row", marginTop: 2 }}>
              <Text style={{ width: 10 }}>•</Text>
              <Text style={{ flex: 1 }}>{renderInline(it)}</Text>
            </View>
          ))}
        </View>
      );
    case "p":
    default:
      return (
        <Text key={key} style={{ marginTop: 6 }}>
          {renderInline(block.text)}
        </Text>
      );
  }
}

// Inline emphasis: **bold** and *italic* (also __ / _).
function renderInline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(<Text key={key++}>{text.slice(last, match.index)}</Text>);
    }
    const token = match[0];
    if (token.startsWith("**") || token.startsWith("__")) {
      parts.push(
        <Text key={key++} style={{ fontWeight: 700 }}>
          {token.slice(2, -2)}
        </Text>
      );
    } else {
      parts.push(
        <Text key={key++} style={{ fontStyle: "italic" }}>
          {token.slice(1, -1)}
        </Text>
      );
    }
    last = match.index + token.length;
  }
  if (last < text.length) {
    parts.push(<Text key={key++}>{text.slice(last)}</Text>);
  }
  return parts;
}
