import { buildAttachmentContext, readyAttachments } from "../../supabase/functions/_shared/attachment-context.ts";

describe("attachment context helpers", () => {
  it("uses only ready attachments with extracted text", () => {
    const rows = [
      { id: "1", file_name: "attest.pdf", extraction_status: "ready", extracted_text: "Relevant attest", ai_summary: "Attest" },
      { id: "2", file_name: "tom.pdf", extraction_status: "ready", extracted_text: "" },
      { id: "3", file_name: "venter.pdf", extraction_status: "extracting", extracted_text: "Ikke klar" },
      { id: "4", file_name: "feil.pdf", extraction_status: "failed", extracted_text: "Ikke bruk" },
    ];

    expect(readyAttachments(rows).map((row) => row.id)).toEqual(["1"]);
    expect(buildAttachmentContext(rows)).toContain("Relevant attest");
    expect(buildAttachmentContext(rows)).not.toContain("Ikke klar");
  });

  it("truncates attachment context by attachment and total limits", () => {
    const context = buildAttachmentContext(
      [
        { id: "1", file_name: "a.txt", extraction_status: "ready", extracted_text: "a".repeat(20) },
        { id: "2", file_name: "b.txt", extraction_status: "ready", extracted_text: "b".repeat(20) },
      ],
      { maxCharsPerAttachment: 8, maxTotalChars: 12 },
    );

    expect(context).toContain("aaaaaaaa");
    expect(context).toContain("bbbb");
    expect(context).not.toContain("bbbbb");
  });
});
