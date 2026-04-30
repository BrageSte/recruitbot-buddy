import { mkdir, writeFile } from "node:fs/promises";
import { pdf } from "@react-pdf/renderer";
import { LetterPdfDocument } from "@/components/cv/pdf/LetterPdfDocument";
import { CvData } from "@/components/cv/types";
import { CV_STYLE_LIST } from "@/components/cv/cvStyles";

const sampleCv: CvData = {
  full_name: "Brage Steen",
  headline: "Produktdesigner",
  email: "brage.steen@example.com",
  phone: "+47 99 88 77 66",
  location: "Oslo",
  linkedin_url: "https://www.linkedin.com/in/bragesteen-produktdesigner",
};

const sampleLetter = [
  "Hei,",
  "",
  "Jeg søker rollen fordi den kombinerer produktforståelse, brukerinnsikt og tydelig gjennomføring. Jeg trives spesielt godt med å gjøre komplekse behov om til ryddige løsninger som team kan bygge videre på.",
  "",
  "I tidligere arbeid har jeg koblet research, prototyping og prioritering tett sammen, slik at beslutninger blir enklere å ta og lettere å forklare. Det gjør meg trygg på at jeg kan bidra raskt hos dere.",
  "",
  "Jeg ser frem til å høre fra dere.",
].join("\n");

describe("LetterPdfDocument", () => {
  it.each(CV_STYLE_LIST.map((style) => style.id))("renders a %s letterhead without throwing", async (styleId) => {
    const doc = (
      <LetterPdfDocument
        cv={sampleCv}
        text={sampleLetter}
        jobTitle="Senior produktdesigner"
        company="RecruitBuddy"
        styleId={styleId}
      />
    );
    const blob = await pdf(doc).toBlob();

    expect(blob.size).toBeGreaterThan(3_000);

    if (process.env.WRITE_LETTER_PDF_FIXTURE === "1") {
      const stream = await pdf(doc).toBuffer();
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      await mkdir("tmp/pdfs", { recursive: true });
      await writeFile(`tmp/pdfs/letter-${styleId}-render-check.pdf`, Buffer.concat(chunks));
    }
  }, 30000);
});
