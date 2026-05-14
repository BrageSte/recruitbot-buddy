import type { AiMode } from "./ai-types.ts";

export const BANNED_NORWEGIAN_CLICHES = [
  "jeg brenner for",
  "lidenskapelig opptatt av",
  "spennende mulighet",
  "dynamisk arbeidsmiljø",
  "resultatorientert lagspiller",
  "stå-på-vilje",
  "stå på vilje",
];

const WORD_LIMITS: Record<AiMode, { min: number; max: number }> = {
  private: { min: 180, max: 450 },
  public: { min: 250, max: 550 },
  cv_first: { min: 60, max: 180 },
};

export interface QualityResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  wordCount: number;
}

export function normalizeAiMode(value: unknown): AiMode {
  return value === "public" || value === "cv_first" ? value : "private";
}

export function validateNorwegianDraft(text: string, mode: AiMode = "private"): QualityResult {
  const normalized = text.trim();
  const lower = normalized.toLocaleLowerCase("nb-NO");
  const errors: string[] = [];
  const warnings: string[] = [];
  const wordCount = countWords(normalized);

  if (!normalized) errors.push("Teksten er tom.");
  for (const phrase of BANNED_NORWEGIAN_CLICHES) {
    if (lower.includes(phrase)) errors.push(`Teksten bruker floskelen "${phrase}".`);
  }
  if (!looksNorwegian(normalized)) {
    errors.push("Teksten ser ikke norsk ut.");
  }

  const limits = WORD_LIMITS[mode];
  if (wordCount < limits.min) warnings.push(`Teksten er kort (${wordCount} ord, anbefalt minst ${limits.min}).`);
  if (wordCount > limits.max) warnings.push(`Teksten er lang (${wordCount} ord, anbefalt maks ${limits.max}).`);

  return { ok: errors.length === 0, errors, warnings, wordCount };
}

export function buildQualityRewriteInstruction(text: string, result: QualityResult, mode: AiMode) {
  return [
    "Omskriv teksten slik at den består kvalitetsreglene.",
    `Modus: ${mode}.`,
    result.errors.length ? `Feil som må fikses:\n- ${result.errors.join("\n- ")}` : "",
    result.warnings.length ? `Advarsler å ta hensyn til:\n- ${result.warnings.join("\n- ")}` : "",
    "Behold ekte fakta, arbeidsgiverrettet tone, norsk bokmål og omtrent samme struktur.",
    "Returner bare den ferdige teksten.",
    `\nTEKST:\n${text}`,
  ].filter(Boolean).join("\n\n");
}

export function findUnsupportedCvFacts(tailoredCv: any, originalCv: any): string[] {
  const issues: string[] = [];
  const originalCompanies = normalizedSet((originalCv?.experiences ?? []).map((item: any) => item?.company));
  const originalInstitutions = normalizedSet((originalCv?.education ?? []).map((item: any) => item?.institution));
  const originalCerts = normalizedSet((originalCv?.certifications ?? []).map((item: any) => item?.name));

  for (const company of (tailoredCv?.experiences ?? []).map((item: any) => item?.company).filter(Boolean)) {
    if (!originalCompanies.has(normalizeFact(company))) issues.push(`Ny arbeidsgiver i CV: ${company}`);
  }
  for (const institution of (tailoredCv?.education ?? []).map((item: any) => item?.institution).filter(Boolean)) {
    if (!originalInstitutions.has(normalizeFact(institution))) issues.push(`Ny utdanningsinstitusjon i CV: ${institution}`);
  }
  for (const cert of (tailoredCv?.certifications ?? []).map((item: any) => item?.name).filter(Boolean)) {
    if (!originalCerts.has(normalizeFact(cert))) issues.push(`Ny sertifisering i CV: ${cert}`);
  }

  return issues;
}

export function countWords(text: string) {
  return (text.trim().match(/\S+/g) ?? []).length;
}

function looksNorwegian(text: string) {
  const lower = text.toLocaleLowerCase("nb-NO");
  const markers = [" og ", " som ", " jeg ", " dere ", " med ", " til ", " for ", " har ", " er "];
  return markers.some((marker) => lower.includes(marker));
}

function normalizedSet(values: unknown[]) {
  return new Set(values.map(normalizeFact).filter(Boolean));
}

function normalizeFact(value: unknown) {
  return String(value ?? "").trim().toLocaleLowerCase("nb-NO").replace(/\s+/g, " ");
}
