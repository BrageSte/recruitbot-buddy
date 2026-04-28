import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "google/gemini-3-flash-preview";

type Question = {
  id: string;
  title: string;
  prompt: string;
  helper?: string;
  placeholder?: string;
  required?: boolean;
};

type SignalDraft = {
  label: string;
  category: "role" | "industry" | "task" | "skill" | "value" | "work_style" | "location" | "dealbreaker" | "other";
  weight: number;
  confidence: number;
  reason?: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function compactCv(cv: any) {
  if (!cv || typeof cv !== "object") return null;
  return {
    full_name: cv.full_name ?? null,
    headline: cv.headline ?? null,
    location: cv.location ?? null,
    intro: cv.intro ?? "",
    experiences: Array.isArray(cv.experiences) ? cv.experiences.slice(0, 8) : [],
    education: Array.isArray(cv.education) ? cv.education.slice(0, 5) : [],
    skills: Array.isArray(cv.skills) ? cv.skills.slice(0, 12) : [],
    languages: Array.isArray(cv.languages) ? cv.languages.slice(0, 8) : [],
    projects: Array.isArray(cv.projects) ? cv.projects.slice(0, 6) : [],
    certifications: Array.isArray(cv.certifications) ? cv.certifications.slice(0, 8) : [],
  };
}

function safeJsonParse(content: unknown) {
  if (typeof content !== "string") return content;
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("AI-svar manglet JSON");
    return JSON.parse(match[0]);
  }
}

function fallbackQuestions(cv: any): Question[] {
  const headline = cv?.headline ? ` som ${cv.headline}` : "";
  return [
    {
      id: "target_roles",
      title: "Hva vil du søke etter?",
      prompt: `Hvilke roller, stillingstitler eller ferdigheter har du lyst til å søke etter${headline}?`,
      placeholder: "f.eks. produktleder, frontend, prosjektkoordinering, kundesuksess...",
      required: true,
    },
    {
      id: "best_work",
      title: "Hva liker du best å jobbe med?",
      prompt: "Hvilke oppgaver gir deg energi i en vanlig arbeidsuke?",
      placeholder: "Skriv konkrete arbeidsoppgaver, ikke bare bransjeord.",
      required: true,
    },
    {
      id: "strongest_skills",
      title: "Hva er du flink til?",
      prompt: "Hvilke ferdigheter eller erfaringer vil du at arbeidsgivere skal legge merke til først?",
      placeholder: "f.eks. struktur, analyse, salg, React, koordinering, relasjonsbygging...",
      required: true,
    },
    {
      id: "growth",
      title: "Hva vil du utvikle videre?",
      prompt: "Hva vil du lære mer av i neste jobb?",
      placeholder: "Teknologi, ansvar, mennesker, fagområde, ledelse...",
    },
    {
      id: "work_style",
      title: "Hvordan jobber du best?",
      prompt: "Beskriv arbeidsmiljø, tempo, samarbeid og grad av selvstendighet som passer deg.",
      placeholder: "f.eks. tydelige mål, lite mikrostyring, team med god faglig sparring...",
    },
    {
      id: "location",
      title: "Hvor kan jobben være?",
      prompt: "Hvor i landet er aktuelt, og hvor viktig er remote/hybrid/kontor?",
      placeholder: "f.eks. Oslo, Bergen, hele Norge remote, hybrid maks 2 dager kontor...",
    },
    {
      id: "dealbreakers",
      title: "Hva er uaktuelt?",
      prompt: "Nevn dealbreakers: arbeidsform, reise, lønn, kultur, bransjer, vakter eller annet.",
      placeholder: "f.eks. mye reising, provisjonslønn, natt/helg, uklare roller...",
    },
    {
      id: "voice",
      title: "Hvordan skal søknader høres ut?",
      prompt: "Hvordan vil du at AI skal skrive på dine vegne?",
      placeholder: "f.eks. kort, varm og konkret. Ikke for selgende.",
    },
  ];
}

function answerText(questions: Question[], answers: Record<string, string>) {
  return questions
    .map((q) => {
      const answer = String(answers?.[q.id] ?? "").trim();
      return answer ? `${q.title}: ${answer}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

function compactChatMessages(messages: unknown) {
  if (!Array.isArray(messages)) return "";
  return messages
    .slice(-10)
    .map((message: any) => {
      const role = message?.role === "user" ? "Bruker" : "Recruiter";
      const content = String(message?.content ?? "").trim();
      return content ? `${role}: ${content.slice(0, 1200)}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

function normalizeQuestions(value: any, cv: any): Question[] {
  const questions = Array.isArray(value?.questions) ? value.questions : Array.isArray(value) ? value : [];
  const normalized = questions.flatMap((q: any, index: number) => {
    const title = String(q.title ?? q.label ?? "").trim();
    const prompt = String(q.prompt ?? q.question ?? "").trim();
    if (!title || !prompt) return [];
    const id = String(q.id ?? title.toLowerCase().replace(/[^a-z0-9æøå]+/gi, "_")).replace(/^_+|_+$/g, "") || `question_${index + 1}`;
    return [{
      id,
      title: title.slice(0, 80),
      prompt: prompt.slice(0, 500),
      helper: q.helper ? String(q.helper).slice(0, 240) : undefined,
      placeholder: q.placeholder ? String(q.placeholder).slice(0, 240) : undefined,
      required: Boolean(q.required ?? index < 3),
    }];
  });
  const fallback = fallbackQuestions(cv);
  const merged = [...normalized, ...fallback].filter((q, index, all) => all.findIndex((item) => item.id === q.id) === index);
  return merged.slice(0, 8);
}

function normalizeWeight(value: unknown, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function normalizeSignal(raw: any): SignalDraft | null {
  const allowed = new Set(["role", "industry", "task", "skill", "value", "work_style", "location", "dealbreaker", "other"]);
  const label = String(raw?.label ?? "").trim();
  if (!label) return null;
  const category = allowed.has(raw?.category) ? raw.category : "other";
  const rawWeight = Number(raw?.weight);
  const weight = Number.isFinite(rawWeight)
    ? Math.max(-100, Math.min(100, Math.round(rawWeight)))
    : category === "dealbreaker"
    ? -80
    : 70;
  const confidence = Math.max(0, Math.min(1, Number(raw?.confidence ?? 0.75)));
  return {
    label: label.slice(0, 120),
    category,
    weight,
    confidence,
    reason: raw?.reason ? String(raw.reason).slice(0, 300) : undefined,
  };
}

function fallbackDraft(cv: any, questions: Question[], answers: Record<string, string>) {
  const answersBlock = answerText(questions, answers);
  const name = cv?.full_name ? `${cv.full_name}` : "Kandidaten";
  const headline = cv?.headline ?? "kandidat";
  const roles = answers.target_roles ?? answers.desired_roles ?? "";
  const bestWork = answers.best_work ?? "";
  const skills = answers.strongest_skills ?? "";
  const workStyle = answers.work_style ?? "";
  const location = answers.location ?? cv?.location ?? "";
  const dealbreakers = answers.dealbreakers ?? "";
  const voice = answers.voice ?? "";

  const sections = {
    about_me: `${name} er ${headline}. Profilen bygger på CV-en og brukerens egne svar, og bør finpusses før den brukes i søknader.`,
    looking_for: roles || "Neste jobb bør matche erfaringen i CV-en og retningen brukeren beskriver i onboarding.",
    interests: [bestWork, skills].filter(Boolean).join("\n") || "Arbeidsoppgaver og ferdigheter fra CV-en bør prioriteres i matchingen.",
    constraints: location || "Sted og arbeidsform er ikke avklart ennå.",
    dealbreakers: dealbreakers || "Ingen tydelige dealbreakers oppgitt.",
    writing_style: voice || "Skriv kort, konkret, ærlig og uten overdrevne påstander.",
  };

  const masterProfile = `# Interesseprofil

## Om meg
${sections.about_me}

## Hva jeg ser etter
${sections.looking_for}

## Interesser og sterke signaler
${sections.interests}

## Rammer
${sections.constraints}

## Dealbreakers
${sections.dealbreakers}

## Onboarding-svar
${answersBlock || "Ingen svar registrert ennå."}`;

  const rawSignals: SignalDraft[] = [];
  for (const item of [roles, bestWork, skills].join(",").split(/[,\n]/)) {
    const label = item.trim();
    if (label.length >= 3) rawSignals.push({ label, category: "skill", weight: 70, confidence: 0.65 });
  }
  if (location) rawSignals.push({ label: String(location).slice(0, 120), category: "location", weight: 60, confidence: 0.7 });
  if (dealbreakers) rawSignals.push({ label: String(dealbreakers).slice(0, 120), category: "dealbreaker", weight: -90, confidence: 0.8 });

  return {
    sections,
    master_profile: masterProfile,
    style_guide: sections.writing_style,
    rules_green: "God match: tydelig treff på ønsket rolle, relevante arbeidsoppgaver, dokumenterte ferdigheter og praktiske rammer.",
    rules_yellow: "Vurder nærmere: delvis relevant rolle, uklart ansvar, manglende informasjon om sted/arbeidsform eller flere ukjente krav.",
    rules_red: dealbreakers || "Unngå jobber som bryter med oppgitte dealbreakers eller krever erfaring CV-en ikke dokumenterer.",
    weights: { professional: 40, culture: 20, practical: 20, enthusiasm: 20 },
    signals: rawSignals.slice(0, 16),
  };
}

function normalizeDraft(value: any, cv: any, questions: Question[], answers: Record<string, string>) {
  const fallback = fallbackDraft(cv, questions, answers);
  const weights = value?.weights ?? {};
  const normalized = {
    sections: {
      about_me: String(value?.sections?.about_me ?? fallback.sections.about_me),
      looking_for: String(value?.sections?.looking_for ?? fallback.sections.looking_for),
      interests: String(value?.sections?.interests ?? fallback.sections.interests),
      constraints: String(value?.sections?.constraints ?? fallback.sections.constraints),
      dealbreakers: String(value?.sections?.dealbreakers ?? fallback.sections.dealbreakers),
      writing_style: String(value?.sections?.writing_style ?? fallback.sections.writing_style),
    },
    master_profile: String(value?.master_profile ?? fallback.master_profile),
    style_guide: String(value?.style_guide ?? fallback.style_guide),
    rules_green: String(value?.rules_green ?? fallback.rules_green),
    rules_yellow: String(value?.rules_yellow ?? fallback.rules_yellow),
    rules_red: String(value?.rules_red ?? fallback.rules_red),
    weights: {
      professional: normalizeWeight(weights.professional, 40),
      culture: normalizeWeight(weights.culture, 20),
      practical: normalizeWeight(weights.practical, 20),
      enthusiasm: normalizeWeight(weights.enthusiasm, 20),
    },
    signals: Array.isArray(value?.signals)
      ? value.signals.map(normalizeSignal).filter(Boolean).slice(0, 30)
      : fallback.signals,
  };
  const total = Object.values(normalized.weights).reduce((sum, n) => sum + n, 0);
  if (total !== 100) normalized.weights = fallback.weights;
  return normalized;
}

async function getAuthedUser(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return { user: null, authHeader: null };
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data } = await userClient.auth.getUser();
  return { user: data.user, authHeader };
}

async function callAi(messages: any[]) {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return null;
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      response_format: { type: "json_object" },
    }),
  });
  if (!resp.ok) {
    console.error("profile-onboarding-ai gateway error", resp.status, await resp.text());
    return null;
  }
  const data = await resp.json();
  return safeJsonParse(data.choices?.[0]?.message?.content);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { user } = await getAuthedUser(req);
    if (!user) return json({ error: "Ikke autentisert" }, 401);

    const body = await req.json().catch(() => ({}));
    const action = body.action;
    const cv = compactCv(body.cv);
    const previousProfile = body.profile ?? null;

    if (action === "generate_questions") {
      const parsed = await callAi([
        {
          role: "system",
          content:
            "Du lager korte norske onboarding-spørsmål for en jobbsøker. Spør om retning, interesser, arbeidsform, sted og dealbreakers. Ikke be brukeren fylle ut CV-fakta som allerede er tydelige.",
        },
        {
          role: "user",
          content: `Lag 6-8 spørsmål som hjelper å bygge en interesseprofil. Returner JSON på formen {"questions":[{"id":"...","title":"...","prompt":"...","helper":"...","placeholder":"...","required":true}]}.

CV:
${cv ? JSON.stringify(cv, null, 2).slice(0, 9000) : "(ingen CV lastet opp)"}

Eksisterende profil:
${previousProfile ? JSON.stringify(previousProfile, null, 2).slice(0, 2500) : "(tom)"}`,
        },
      ]);

      return json({ questions: normalizeQuestions(parsed, cv) });
    }

    if (action === "generate_profile_draft") {
      const questions = normalizeQuestions(body.questions, cv);
      const answers = body.answers && typeof body.answers === "object" ? body.answers : {};
      const parsed = await callAi([
        {
          role: "system",
          content:
            "Du er en norsk karriereprofil-assistent. Bygg en ærlig interesseprofil fra CV og brukerens svar. Ikke finn på erfaring, arbeidsgivere, utdanning, datoer eller sertifiseringer. Skille fakta fra ønsker.",
        },
        {
          role: "user",
          content: `Lag et profilutkast. Returner KUN JSON med denne formen:
{
  "sections": {
    "about_me": "...",
    "looking_for": "...",
    "interests": "...",
    "constraints": "...",
    "dealbreakers": "...",
    "writing_style": "..."
  },
  "master_profile": "Markdown med overskriftene Om meg, Hva jeg ser etter, Interesser og sterke signaler, Rammer, Dealbreakers",
  "style_guide": "...",
  "rules_green": "...",
  "rules_yellow": "...",
  "rules_red": "...",
  "weights": { "professional": 40, "culture": 20, "practical": 20, "enthusiasm": 20 },
  "signals": [
    { "label": "...", "category": "role|industry|task|skill|value|work_style|location|dealbreaker|other", "weight": 70, "confidence": 0.8, "reason": "..." }
  ]
}

CV:
${cv ? JSON.stringify(cv, null, 2).slice(0, 9000) : "(ingen CV lastet opp)"}

Spørsmål og svar:
${answerText(questions, answers) || "(ingen svar)"}

Eksisterende profil:
${previousProfile ? JSON.stringify(previousProfile, null, 2).slice(0, 2500) : "(tom)"}`,
        },
      ]);

      return json({ draft: normalizeDraft(parsed, cv, questions, answers) });
    }

    if (action === "refine_profile_draft") {
      const questions = normalizeQuestions(body.questions, cv);
      const answers = body.answers && typeof body.answers === "object" ? body.answers : {};
      const currentDraft = normalizeDraft(body.draft, cv, questions, answers);
      const userMessage = String(body.user_message ?? "").trim();
      if (!userMessage) return json({ error: "Mangler melding" }, 400);

      const parsed = await callAi([
        {
          role: "system",
          content:
            "Du er en norsk recruiter og karrierecoach som hjelper en jobbsøker å avklare retning etter CV-onboarding. Svar kort, konkret og rolig. Oppdater profilen når brukeren korrigerer, legger til preferanser eller presiserer hva de vil. Ikke finn på arbeidserfaring, arbeidsgivere, utdanning, datoer, sertifiseringer eller ferdigheter som fakta. Nye opplysninger fra brukeren skal behandles som brukeroppgitte preferanser, ønsker, arbeidsstil, rammer eller selvbeskrivelse.",
        },
        {
          role: "user",
          content: `Oppdater interesseprofilen basert på siste melding i recruiter-chatten.
Returner KUN JSON med denne formen:
{
  "reply": "Kort norsk svar til brukeren som forklarer hva du justerte og eventuelt ett konkret oppfølgingsspørsmål.",
  "draft": {
    "sections": {
      "about_me": "...",
      "looking_for": "...",
      "interests": "...",
      "constraints": "...",
      "dealbreakers": "...",
      "writing_style": "..."
    },
    "master_profile": "Markdown med overskriftene Om meg, Hva jeg ser etter, Interesser og sterke signaler, Rammer, Dealbreakers",
    "style_guide": "...",
    "rules_green": "...",
    "rules_yellow": "...",
    "rules_red": "...",
    "weights": { "professional": 40, "culture": 20, "practical": 20, "enthusiasm": 20 },
    "signals": [
      { "label": "...", "category": "role|industry|task|skill|value|work_style|location|dealbreaker|other", "weight": 70, "confidence": 0.8, "reason": "..." }
    ]
  }
}

Siste melding:
${userMessage}

Tidligere chat:
${compactChatMessages(body.messages) || "(ingen tidligere chat)"}

Nåværende profilutkast:
${JSON.stringify(currentDraft, null, 2).slice(0, 10000)}

CV:
${cv ? JSON.stringify(cv, null, 2).slice(0, 7000) : "(ingen CV lastet opp)"}

Spørsmål og svar fra onboarding:
${answerText(questions, answers) || "(ingen svar)"}

Eksisterende lagret profil:
${previousProfile ? JSON.stringify(previousProfile, null, 2).slice(0, 2000) : "(tom)"}`,
        },
      ]);

      if (!parsed) throw new Error("AI svarte ikke");
      const rawDraftValue = parsed?.draft ?? parsed;
      const rawDraft = rawDraftValue && typeof rawDraftValue === "object" ? rawDraftValue : {};
      const mergedDraft = {
        ...currentDraft,
        ...rawDraft,
        sections: { ...currentDraft.sections, ...(rawDraft?.sections ?? {}) },
        weights: { ...currentDraft.weights, ...(rawDraft?.weights ?? {}) },
        signals: Array.isArray(rawDraft?.signals) ? rawDraft.signals : currentDraft.signals,
      };
      const reply = String(parsed?.reply ?? "Jeg har oppdatert kartleggingen. Se over oppsummeringen før vi setter opp jobbsøket.").slice(0, 1200);

      return json({ reply, draft: normalizeDraft(mergedDraft, cv, questions, answers) });
    }

    return json({ error: "Ukjent action" }, 400);
  } catch (e) {
    console.error("profile-onboarding-ai error", e);
    return json({ error: (e as Error).message }, 500);
  }
});
