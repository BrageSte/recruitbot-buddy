export type AttachmentContextRow = {
  id: string;
  file_name: string;
  extracted_text?: string | null;
  ai_summary?: string | null;
  extraction_status?: string | null;
};

type BuildAttachmentContextOptions = {
  maxAttachments?: number;
  maxCharsPerAttachment?: number;
  maxTotalChars?: number;
};

export function readyAttachments(rows: AttachmentContextRow[]) {
  return rows.filter((row) => row.extraction_status === "ready" && String(row.extracted_text ?? "").trim());
}

export function buildAttachmentContext(rows: AttachmentContextRow[], options: BuildAttachmentContextOptions = {}) {
  const maxAttachments = options.maxAttachments ?? 6;
  const maxCharsPerAttachment = options.maxCharsPerAttachment ?? 4000;
  const maxTotalChars = options.maxTotalChars ?? 16000;
  const chunks: string[] = [];
  let totalChars = 0;

  for (const row of readyAttachments(rows).slice(0, maxAttachments)) {
    const remaining = maxTotalChars - totalChars;
    if (remaining <= 0) break;

    const text = String(row.extracted_text ?? "").trim();
    const excerpt = text.slice(0, Math.min(maxCharsPerAttachment, remaining));
    if (!excerpt) continue;

    const summary = String(row.ai_summary ?? "").trim();
    const chunk = [
      `VEDLEGG: ${row.file_name}`,
      summary ? `Kort oppsummering: ${summary}` : "",
      "Tekstutdrag:",
      excerpt,
    ].filter(Boolean).join("\n");

    chunks.push(chunk);
    totalChars += excerpt.length;
  }

  return chunks.join("\n\n---\n\n");
}
