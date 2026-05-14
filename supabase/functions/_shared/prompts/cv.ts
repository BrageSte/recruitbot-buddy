import type { AiTool } from "../ai-types.ts";

export const CV_TAILOR_PROMPT_VERSION = "cv-tailor-v2";
export const CV_EDIT_PROMPT_VERSION = "cv-edit-v2";
export const IMPORT_CV_PROMPT_VERSION = "import-cv-v2";

export const ALLOWED_CV_SECTIONS = ["experiences", "education", "skills", "languages", "projects", "certifications"];

export function getCvTailoringSystemPrompt() {
  return `Du tilpasser en CV til en spesifikk stilling. ABSOLUTT REGEL: Aldri finn på erfaring, utdanning, sertifiseringer eller ferdigheter som ikke finnes i mal-en.

Du SKAL produsere et komplett, strukturert "tailored_cv"-objekt med samme felter som mal-en.

Du kan:
- Omformulere intro, beskrivelser og bullet points slik at de treffer stillingen bedre.
- Endre rekkefølgen på elementer i listene.
- Flytte mindre relevant innhold ned eller tone det ned i anbefalingene.
- Utelate originalinnhold som er mindre relevant for akkurat denne stillingen.
- Justere "section_order" slik at de viktigste avsnittene kommer først.

CV-kvalitet og PDF-sikkerhet:
- Tenk klassisk CV, ikke kampanje/landing page: rolig struktur, tydelige seksjoner, korte punkter.
- Ikke lag lange avsnitt inni bullets. Bruk konkrete, lesbare setninger.
- Behold kronologi og kontekst slik at leseren forstår arbeidsgiver, rolle og tidsrom.
- Ikke bruk markdown, emoji eller visuell pynt i structured JSON-feltene.
- Bruk tomme arrays [] for tomme seksjoner. Aldri returner [{}].
- Ikke legg hele original-CV-en inn bakerst for sikkerhets skyld.

Svar på norsk via tool-call.`;
}

export function getCvEditSystemPrompt() {
  return `Du er en presis CV-redaktør for norske, jobbspesifikke CV-tilpasninger.

Brukeren gir feedback på en AI-tilpasset CV for én konkret søknad. Rediger bare den jobbspesifikke CV-snapshoten, aldri den originale CV-malen.

ABSOLUTTE REGLER:
- Ikke finn på erfaring, utdanning, sertifiseringer, teknologier, resultater, tall, arbeidsgivere, ansvarsnivå eller personlige egenskaper.
- Bruk ORIGINAL CV som faktagrunnlag. CURRENT TAILORED CV er teksten som skal forbedres.
- Hvis brukeren ber om noe som ikke støttes av fakta, gjør den nærmeste trygge endringen og forklar kort i notes.
- Behold kontakt-/identitetsfelt som navn, e-post, telefon, lenker, lokasjon og bilde uendret.
- Returner alltid komplett, strukturert JSON via tool-call.
- Bruk tomme arrays [] for tomme seksjoner. Aldri returner [{}].
- Hold CV-en klassisk, kort, konkret og PDF-sikker.
- Ikke legg hele original-CV-en inn bakerst for sikkerhets skyld.

Svar på norsk.`;
}

export function getImportCvSystemPrompt() {
  return `Du er en presis CV-parser. Du får en CV som tekst eller PDF og skal returnere ren JSON som matcher skjemaet.

Regler:
- Bevar originalspråket fra CV-en.
- Datoer på formatet "YYYY-MM" der mulig, ellers "YYYY".
- Hvis nåværende stilling, sett "current": true og la "end" stå tom.
- Grupper ferdigheter i meningsfulle kategorier.
- "intro" = kort sammendrag/elevator pitch hvis CV-en har det, ellers tom streng.
- Hold CV-data PDF-sikker: ingen tomme objekter i lister, ingen svært lange pyntetekster, ingen dekorative overskrifter.
- Erfaringer bør ha korte, konkrete bullets. Ikke slå sammen flere roller hvis CV-en tydelig skiller dem.
- Kontaktfelt skal være rene tekstverdier uten markdown.
- Ikke finn på data. Tomme arrays er greit.
- Returner kun strukturert JSON.`;
}

export const cvSnapshotSchema = {
  type: "object",
  properties: {
    intro: { type: "string" },
    headline: { type: "string" },
    experiences: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          company: { type: "string" },
          location: { type: "string" },
          start: { type: "string" },
          end: { type: "string" },
          current: { type: "boolean" },
          description: { type: "string" },
          bullets: { type: "array", items: { type: "string" } },
          technologies: { type: "array", items: { type: "string" } },
        },
        required: ["title", "company"],
      },
    },
    education: {
      type: "array",
      items: {
        type: "object",
        properties: {
          degree: { type: "string" },
          institution: { type: "string" },
          start: { type: "string" },
          end: { type: "string" },
          description: { type: "string" },
        },
        required: ["degree", "institution"],
      },
    },
    skills: {
      type: "array",
      items: {
        type: "object",
        properties: {
          category: { type: "string" },
          items: { type: "array", items: { type: "string" } },
        },
        required: ["category", "items"],
      },
    },
    languages: {
      type: "array",
      items: {
        type: "object",
        properties: { name: { type: "string" }, level: { type: "string" } },
        required: ["name", "level"],
      },
    },
    projects: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          url: { type: "string" },
          technologies: { type: "array", items: { type: "string" } },
        },
        required: ["name", "description"],
      },
    },
    certifications: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          issuer: { type: "string" },
          date: { type: "string" },
          url: { type: "string" },
        },
        required: ["name", "issuer"],
      },
    },
  },
};

export const tailorCvTool: AiTool = {
  name: "tailor_cv",
  description: "Lag en jobbspesifikk, strukturert CV-snapshot basert bare på original CV.",
  strict: false,
  parameters: {
    type: "object",
    properties: {
      tailored_cv: cvSnapshotSchema,
      section_order: { type: "array", items: { type: "string", enum: ALLOWED_CV_SECTIONS } },
      tailored_intro: { type: "string" },
      highlight_experiences: { type: "array", items: { type: "string" } },
      deemphasize: { type: "array", items: { type: "string" } },
      prioritize_skills: { type: "array", items: { type: "string" } },
      rephrase_suggestions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            context: { type: "string" },
            before: { type: "string" },
            after: { type: "string" },
          },
          required: ["context", "before", "after"],
        },
      },
      tailored_cv_markdown: { type: "string" },
      notes: { type: "string" },
    },
    required: [
      "tailored_cv",
      "section_order",
      "tailored_intro",
      "highlight_experiences",
      "deemphasize",
      "prioritize_skills",
      "rephrase_suggestions",
      "tailored_cv_markdown",
    ],
  },
};

export const editTailoredCvTool: AiTool = {
  ...tailorCvTool,
  name: "edit_tailored_cv",
  description: "Rediger en jobbspesifikk CV-snapshot trygt basert på original CV og brukerfeedback.",
  parameters: {
    ...tailorCvTool.parameters,
    properties: {
      ...(tailorCvTool.parameters.properties as Record<string, unknown>),
      change_summary: { type: "string" },
    },
    required: ["tailored_cv", "section_order", "change_summary"],
  },
};

export const importCvSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    full_name: { type: ["string", "null"] },
    headline: { type: ["string", "null"] },
    email: { type: ["string", "null"] },
    phone: { type: ["string", "null"] },
    location: { type: ["string", "null"] },
    linkedin_url: { type: ["string", "null"] },
    website_url: { type: ["string", "null"] },
    intro: { type: "string" },
    experiences: cvSnapshotSchema.properties.experiences,
    education: cvSnapshotSchema.properties.education,
    skills: cvSnapshotSchema.properties.skills,
    languages: cvSnapshotSchema.properties.languages,
    projects: cvSnapshotSchema.properties.projects,
    certifications: cvSnapshotSchema.properties.certifications,
  },
  required: [
    "full_name",
    "headline",
    "email",
    "phone",
    "location",
    "linkedin_url",
    "website_url",
    "intro",
    "experiences",
    "education",
    "skills",
    "languages",
    "projects",
    "certifications",
  ],
};
