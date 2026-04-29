import { mkdir, writeFile } from "node:fs/promises";
import { pdf } from "@react-pdf/renderer";
import { CvPdfDocument } from "@/components/cv/pdf/CvPdfDocument";
import { CvData } from "@/components/cv/types";
import { CV_STYLE_LIST } from "@/components/cv/cvStyles";

const longBullet =
  "Ledet strukturert arbeid med krav, prioritering, interessenter og leveranser på tvers av team, med tydelig dokumentasjon og ukentlig oppfølging.";

const sampleCv: CvData = {
  full_name: "Kari Nordmann",
  headline: "Prosjektleder og digital rådgiver",
  email: "kari.nordmann@example.com",
  phone: "+47 99 88 77 66",
  location: "Oslo",
  linkedin_url: "https://www.linkedin.com/in/kari-nordmann-med-et-langt-navn",
  website_url: "https://kari-nordmann.example.com/portfolio/prosjekter-og-caser",
  intro:
    "Erfaren prosjektleder med bakgrunn fra digitale tjenester, forbedringsarbeid og tverrfaglige leveranser. Jobber strukturert med mennesker, mål, fremdrift og kvalitet.",
  section_order: ["experiences", "skills", "education", "projects", "languages", "certifications"],
  experiences: Array.from({ length: 5 }, (_, i) => ({
    title: i === 0 ? "Senior prosjektleder" : `Prosjektleder ${i}`,
    company: i === 0 ? "Eksempelgruppen" : `Arbeidsgiver ${i}`,
    location: "Oslo",
    start: `20${18 - i}-01`,
    end: i === 0 ? undefined : `20${19 - i}-12`,
    current: i === 0,
    description:
      "Ansvar for planlegging, koordinering og gjennomføring av prosjekter med flere interessenter og tydelige krav til kvalitet, fremdrift og gevinstrealisering.",
    bullets: [longBullet, longBullet, longBullet, longBullet],
    technologies: ["Jira", "Confluence", "Miro", "Power BI", "SharePoint"],
  })),
  education: [
    {
      degree: "Master i organisasjon og ledelse",
      institution: "Universitetet i Oslo",
      start: "2014",
      end: "2016",
      description: "Fordypning i endringsledelse, strategi og digitalisering.",
    },
  ],
  skills: [
    {
      category: "Prosjekt og produkt",
      items: ["Roadmaps", "prioritering", "gevinstrealisering", "workshops", "risikostyring", "stakeholder management"],
    },
    {
      category: "Verktøy",
      items: ["Jira", "Confluence", "Miro", "Notion", "Power BI", "Excel", "SharePoint", "Teams"],
    },
  ],
  languages: [
    { name: "Norsk", level: "Morsmål" },
    { name: "Engelsk", level: "Flytende" },
  ],
  projects: [
    {
      name: "Digital saksflyt",
      description: "Ledet innføring av ny arbeidsflyt med tydeligere roller, bedre datakvalitet og kortere behandlingstid.",
      technologies: ["Prosesskartlegging", "Workshops", "Power BI"],
    },
  ],
  certifications: [
    { name: "PRINCE2 Foundation", issuer: "PeopleCert", date: "2020" },
  ],
};

describe("CvPdfDocument", () => {
  it.each(CV_STYLE_LIST.map((style) => style.id))("renders a long %s CV PDF without throwing", async (styleId) => {
    const blob = await pdf(<CvPdfDocument cv={sampleCv} styleId={styleId} />).toBlob();

    expect(blob.size).toBeGreaterThan(5_000);

    if (process.env.WRITE_CV_PDF_FIXTURE === "1") {
      const stream = await pdf(<CvPdfDocument cv={sampleCv} styleId={styleId} />).toBuffer();
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      await mkdir("tmp/pdfs", { recursive: true });
      await writeFile(`tmp/pdfs/cv-${styleId}-render-check.pdf`, Buffer.concat(chunks));
    }
  }, 30000);
});
