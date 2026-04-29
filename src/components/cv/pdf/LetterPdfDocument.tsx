// Vector-PDF cover letter matching the active CV style.
// Includes a small markdown parser that handles paragraphs, headings (h1–h3),
// bullet lists, bold (**), and italic (*) — the 90% case for application letters.

import { ReactNode } from "react";
import { Document, Page, View, Text } from "@react-pdf/renderer";
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
  const today = new Date().toLocaleDateString("no-NO", { year: "numeric", month: "long", day: "numeric" });

  return (
    <Document>
      <Page size="A4" style={[s.page, { paddingBottom: 56 }]}>
        {/* Top accent strip + header (page-1 only — the rest of the letter is plain) */}
        <View style={{ borderTopWidth: 4, borderTopColor: style.accent, paddingHorizontal: 56, paddingTop: 36, paddingBottom: 18 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: fontFor(style), fontSize: 18, fontWeight: 700, color: style.ink, letterSpacing: 0 }}>
                {cv.full_name || "Navn Navnesen"}
              </Text>
              {cv.headline ? (
                <Text style={{ fontSize: 10, color: style.accent, marginTop: 1, fontWeight: 500 }}>{cv.headline}</Text>
              ) : null}
            </View>
            <View style={{ alignItems: "flex-end" }}>
              {[cv.email, cv.phone, cv.location].filter(Boolean).map((p, i) => (
                <Text key={i} style={{ fontSize: 9, color: style.muted, lineHeight: 1.55 }}>{p}</Text>
              ))}
              {cv.linkedin_url ? (
                <Text style={{ fontSize: 9, color: style.muted, lineHeight: 1.55 }}>{cv.linkedin_url}</Text>
              ) : null}
            </View>
          </View>
        </View>

        {/* Body */}
        <View style={{ paddingHorizontal: 56, paddingTop: 4 }}>
          <Text style={{ fontSize: 9.5, color: style.muted, marginBottom: 18 }}>{today}</Text>

          {(jobTitle || company) ? (
            <View style={{ marginBottom: 14 }}>
              <Text style={{ fontSize: 12, fontWeight: 600, color: style.ink, fontFamily: fontFor(style) }}>
                Søknad{jobTitle ? `: ${jobTitle}` : ""}
              </Text>
              {company ? (
                <Text style={{ fontSize: 10, color: style.accent, marginTop: 1 }}>{company}</Text>
              ) : null}
            </View>
          ) : null}

          <MarkdownBody text={text || "*Ingen tekst ennå.*"} style={style} />

          <View style={{ marginTop: 22 }}>
            <Text style={{ fontSize: 10, color: style.ink }}>Med vennlig hilsen</Text>
            <Text style={{ fontFamily: fontFor(style), fontWeight: 600, fontSize: 11, color: style.accent, marginTop: 14 }}>
              {cv.full_name || ""}
            </Text>
          </View>
        </View>
      </Page>
    </Document>
  );
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
