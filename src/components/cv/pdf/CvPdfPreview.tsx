// Live PDF preview wrappers — renders the actual PDF in an iframe so what you
// see is exactly what the export produces. Re-renders are debounced to keep
// the editor responsive during typing.

import { useEffect, useState } from "react";
import { PDFViewer } from "@react-pdf/renderer";
import { CvData } from "../types";
import { CvPdfDocument } from "./CvPdfDocument";
import { LetterPdfDocument } from "./LetterPdfDocument";

const DEBOUNCE_MS = 350;

function useDebounced<T>(value: T, ms = DEBOUNCE_MS): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

const viewerStyle: React.CSSProperties = {
  width: "100%",
  height: "min(80vh, 1100px)",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  background: "hsl(var(--muted))",
  boxShadow: "var(--shadow-card)",
};

export const CvPdfPreview = ({ cv, styleId }: { cv: CvData; styleId?: string | null }) => {
  const debouncedCv = useDebounced(cv);
  const debouncedStyle = useDebounced(styleId);
  return (
    <PDFViewer style={viewerStyle as any} showToolbar={false}>
      <CvPdfDocument cv={debouncedCv} styleId={debouncedStyle} />
    </PDFViewer>
  );
};

export const LetterPdfPreview = ({
  cv, text, jobTitle, company, styleId,
}: {
  cv: CvData;
  text: string;
  jobTitle?: string | null;
  company?: string | null;
  styleId?: string | null;
}) => {
  const debouncedCv = useDebounced(cv);
  const debouncedText = useDebounced(text);
  const debouncedStyle = useDebounced(styleId);
  return (
    <PDFViewer style={viewerStyle as any} showToolbar={false}>
      <LetterPdfDocument
        cv={debouncedCv}
        text={debouncedText}
        jobTitle={jobTitle}
        company={company}
        styleId={debouncedStyle}
      />
    </PDFViewer>
  );
};
