export const PRE_ONBOARDING_DRAFT_KEY = "pre_onboarding_draft";

export type PreOnboardingDraft = {
  targetRoles?: string;
  desiredTasks?: string;
  location?: string;
  workStyle?: string;
  dealbreakers?: string;
  linkedinUrl?: string;
  email?: string;
  createdAt?: string;
};

export type DraftQuestion = {
  id: string;
  title: string;
  prompt: string;
  placeholder?: string;
  required?: boolean;
};

const clean = (value: unknown) => String(value ?? "").trim();

export const normalizeLinkedInUrl = (value: string) => {
  const trimmed = clean(value);
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^(www\.)?linkedin\.com/i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
};

export const normalizePreOnboardingDraft = (draft: Partial<PreOnboardingDraft>): PreOnboardingDraft => ({
  targetRoles: clean(draft.targetRoles),
  desiredTasks: clean(draft.desiredTasks),
  location: clean(draft.location),
  workStyle: clean(draft.workStyle),
  dealbreakers: clean(draft.dealbreakers),
  linkedinUrl: normalizeLinkedInUrl(clean(draft.linkedinUrl)),
  email: clean(draft.email).toLowerCase(),
  createdAt: draft.createdAt || new Date().toISOString(),
});

export const loadPreOnboardingDraft = (): PreOnboardingDraft | null => {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(PRE_ONBOARDING_DRAFT_KEY);
  if (!raw) return null;
  try {
    return normalizePreOnboardingDraft(JSON.parse(raw));
  } catch {
    return null;
  }
};

export const savePreOnboardingDraft = (draft: Partial<PreOnboardingDraft>) => {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(PRE_ONBOARDING_DRAFT_KEY, JSON.stringify(normalizePreOnboardingDraft(draft)));
};

export const clearPreOnboardingDraft = () => {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(PRE_ONBOARDING_DRAFT_KEY);
};

export const questionsFromPreOnboardingDraft = (): DraftQuestion[] => [
  {
    id: "target_roles",
    title: "Hva vil du finne?",
    prompt: "Hvilke roller, fagområder eller stillingstitler skal Søkly lete etter?",
    placeholder: "f.eks. produktleder, frontend, kundesuksess, prosjektkoordinator",
    required: true,
  },
  {
    id: "best_work",
    title: "Hva vil du gjøre mer av?",
    prompt: "Hvilke arbeidsoppgaver eller typer problemer vil du helst bruke tiden på?",
    placeholder: "f.eks. kundedialog, analyse, bygging, koordinering, strategi",
    required: true,
  },
  {
    id: "location",
    title: "Hvor kan jobben være?",
    prompt: "Skriv sted, remote/hybrid, pendling eller andre praktiske rammer.",
    placeholder: "f.eks. Oslo hybrid, Bergen, remote fra Norge",
    required: true,
  },
  {
    id: "dealbreakers",
    title: "Hva skal vi styre unna?",
    prompt: "Nevn ting som gjør en jobb uaktuell.",
    placeholder: "f.eks. mye reising, provisjon, natt/helg, uklart ansvar",
  },
  {
    id: "work_style",
    title: "Hvordan jobber du best?",
    prompt: "Beskriv arbeidsform, tempo, team og kultur som passer deg.",
    placeholder: "f.eks. tydelige mål, faglig sparring, selvstendig ansvar",
  },
];

export const answersFromPreOnboardingDraft = (draft: PreOnboardingDraft | null | undefined) => {
  if (!draft) return {};
  return {
    target_roles: clean(draft.targetRoles),
    best_work: clean(draft.desiredTasks),
    strongest_skills: clean(draft.desiredTasks),
    location: clean(draft.location),
    work_style: clean(draft.workStyle),
    dealbreakers: clean(draft.dealbreakers),
    linkedin_url: clean(draft.linkedinUrl),
  };
};

export const hasUsefulPreOnboardingDraft = (draft: PreOnboardingDraft | null | undefined) =>
  Boolean(
    draft &&
      [
        draft.targetRoles,
        draft.desiredTasks,
        draft.location,
        draft.workStyle,
        draft.dealbreakers,
        draft.linkedinUrl,
      ].some((value) => clean(value).length > 0),
  );
