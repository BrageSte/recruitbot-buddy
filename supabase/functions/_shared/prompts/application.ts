import type { AiMode, AiTool } from "../ai-types.ts";

export const APPLICATION_PROMPT_VERSION = "application-writer-v2";
export const APPLICATION_EDIT_PROMPT_VERSION = "application-editor-v2";
export const PICK_CV_PROMPT_VERSION = "pick-cv-v2";

const MODE_RULES: Record<AiMode, string> = {
  private: "Privat sektor-modus: skriv direkte, konkret og arbeidsgiverrettet. 3-5 avsnitt er nok.",
  public: "Offentlig sektor-modus: vær tydeligere på krav, kvalifikasjoner og dokumenterbar erfaring. Unngå salgsaktig språk.",
  cv_first: "CV-first-modus: skriv en kort motivasjonstekst og la CV-notatene bære hovedtilpasningen.",
};

export function getApplicationSystemPrompt(mode: AiMode) {
  return `Du er en presis søknadsredaktør for norske jobbsøknader. Skriv på norsk, ærlig, konkret og arbeidsgiverorientert.

${MODE_RULES[mode]}

Regler:
- Bruk "dere" når du kobler kandidatens erfaring til arbeidsgiverens behov.
- Vis tydelig hva kandidaten kan bidra med, gjerne med formuleringer som "Med meg får dere..." når det passer naturlig.
- Ikke bruk floskler som "jeg brenner for", "lidenskapelig opptatt av", "spennende mulighet" eller tom entusiasme.
- Ikke finn på erfaringer, resultater, utdanning, sertifiseringer eller ferdigheter.
- Hvis noe er uklart, skriv generelt eller la det være ute.
- CV-notater skal være redaksjonelle forslag til vektlegging, rekkefølge og formulering. Ikke foreslå nye fakta som ikke finnes i CV-en.
- Tenk klassisk CV: kort, ryddig, konkret og PDF-vennlig.
- Svar via tool-call med komplett søknadstekst og CV-notater.`;
}

export function getApplicationEditSystemPrompt() {
  return `Du er en presis tekstredaktør for norske jobbsøknader. Brukeren gir deg gjeldende søknadstekst og en instruksjon på naturlig språk.

Regler:
- Returner kun den fullstendige, oppdaterte søknadsteksten.
- Behold avsnittsstruktur og linjeskift med mindre instruksjonen ber om noe annet.
- Behold språk (norsk bokmål med mindre originalen er noe annet).
- Ikke finn på fakta som ikke står i originalen eller i jobbkonteksten.
- Skriv mer om hva arbeidsgiver får, ikke bare hva kandidaten ønsker.
- Bruk gjerne "dere" når teksten retter seg mot arbeidsgiveren.
- Unngå floskler som "jeg brenner for", "lidenskapelig opptatt av", "spennende mulighet" og tom motivasjon.
- Hvis brukeren markerer kun et utvalg av teksten mellom <SELECTION>...</SELECTION>, endre kun den delen og returner hele dokumentet.
- Hvis instruksjonen er uklar, gjør den mest sannsynlige trygge tolkningen.`;
}

export const writeApplicationTool: AiTool = {
  name: "write_application",
  description: "Skriv en norsk, faktabasert søknad og korte CV-notater.",
  strict: true,
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      application_text: { type: "string", description: "Hele søknaden i markdown, klar til redigering." },
      cv_notes: { type: "string", description: "Markdown-notater om hva som bør vektlegges/justeres i CV-en." },
    },
    required: ["application_text", "cv_notes"],
  },
};

export function makePickCvTool(cvIds: string[]): AiTool {
  return {
    name: "pick_cv",
    description: "Velg CV-varianten som passer best til stillingen.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        cv_template_id: { type: "string", enum: cvIds },
        reason: { type: "string" },
      },
      required: ["cv_template_id", "reason"],
    },
  };
}
