// Generates a vector PDF from a react-pdf <Document> tree and triggers
// a browser download.

import { ReactElement } from "react";
import { pdf, DocumentProps } from "@react-pdf/renderer";

export async function downloadPdfDocument(
  doc: ReactElement<DocumentProps>,
  fileName: string
): Promise<void> {
  const blob = await pdf(doc).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a tick to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
