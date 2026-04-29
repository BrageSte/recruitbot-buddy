import { describe, expect, it } from "vitest";
import { linkedinImportStatusCopy } from "@/lib/linkedinImportStatus";

describe("LinkedIn import status copy", () => {
  it.each([
    ["ok", "LinkedIn-tekst hentet"],
    ["blocked", "LinkedIn lagret som hint"],
    ["empty", "LinkedIn lagret som hint"],
    ["error", "LinkedIn kunne ikke hentes"],
    ["pending", "LinkedIn klar som hint"],
  ] as const)("maps %s to a clear user-facing status", (status, title) => {
    expect(linkedinImportStatusCopy(status).title).toBe(title);
    expect(linkedinImportStatusCopy(status).detail).toBeTruthy();
  });

  it("uses backend hints when available", () => {
    expect(linkedinImportStatusCopy("blocked", "URL lagret.").detail).toBe("URL lagret.");
  });
});
