import { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";
import type { CvData } from "../types";

const LazyCvPdfPreview = lazy(async () => {
  const mod = await import("./CvPdfPreview");
  return { default: mod.CvPdfPreview };
});

const LazyLetterPdfPreview = lazy(async () => {
  const mod = await import("./CvPdfPreview");
  return { default: mod.LetterPdfPreview };
});

const PdfPreviewFallback = () => (
  <div className="flex h-[min(80vh,1100px)] w-full items-center justify-center rounded-md border border-border bg-muted/30">
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>Laster PDF-forhandsvisning...</span>
    </div>
  </div>
);

export const DeferredCvPdfPreview = ({
  cv,
  styleId,
}: {
  cv: CvData;
  styleId?: string | null;
}) => (
  <Suspense fallback={<PdfPreviewFallback />}>
    <LazyCvPdfPreview cv={cv} styleId={styleId} />
  </Suspense>
);

export const DeferredLetterPdfPreview = ({
  cv,
  text,
  jobTitle,
  company,
  styleId,
}: {
  cv: CvData;
  text: string;
  jobTitle?: string | null;
  company?: string | null;
  styleId?: string | null;
}) => (
  <Suspense fallback={<PdfPreviewFallback />}>
    <LazyLetterPdfPreview
      cv={cv}
      text={text}
      jobTitle={jobTitle}
      company={company}
      styleId={styleId}
    />
  </Suspense>
);
