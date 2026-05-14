import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { ScoreBadge } from "@/components/ScoreBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Bot,
  ChevronDown,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileText,
  Loader2,
  LogOut,
  MessageSquare,
  Plus,
  Rss,
  Send,
  Sparkles,
  Target,
  Trash2,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import {
  answersFromPreOnboardingDraft,
  hasUsefulPreOnboardingDraft,
  loadPreOnboardingDraft,
  questionsFromPreOnboardingDraft,
  savePreOnboardingDraft,
  type PreOnboardingDraft,
} from "@/lib/preOnboarding";
import { normalizeWeights, type MatchPriority, weightsFromPriority } from "@/lib/onboardingWeights";
import { linkedinImportStatusCopy, type LinkedInImportStatus } from "@/lib/linkedinImportStatus";
import { buildSourceSearchText } from "@/lib/sourceSuggestions";

type StepKey = "cv" | "questions" | "review" | "chat" | "setup";

type CvDraft = {
  id?: string;
  cv_style?: string;
  full_name?: string | null;
  headline?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  linkedin_url?: string | null;
  website_url?: string | null;
  photo_url?: string | null;
  intro?: string;
  experiences?: any[];
  education?: any[];
  skills?: any[];
  languages?: any[];
  projects?: any[];
  certifications?: any[];
};

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

type ProfileDraft = {
  sections?: Record<string, string>;
  master_profile: string;
  style_guide: string;
  rules_green: string;
  rules_yellow: string;
  rules_red: string;
  weights: {
    professional: number;
    culture: number;
    practical: number;
    enthusiasm: number;
  };
  signals: SignalDraft[];
};

type OnboardingChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  change_summary?: string;
};

type SetupState = Record<string, { status: "pending" | "running" | "done" | "error"; detail?: string }>;

type SetupMatchPreview = {
  id: string;
  match_score: number | null;
  status: string | null;
  match_reasoning?: any;
  external_jobs?: {
    title?: string | null;
    company?: string | null;
    location?: string | null;
    provider?: string | null;
    source_url?: string | null;
    deadline?: string | null;
    raw_data?: any;
  } | null;
};

type OnboardingSourceSuggestion = {
  id: string;
  provider: "finn" | "arbeidsplassen";
  name: string;
  query: string;
  location: string | null;
  search_url: string;
  reason: string | null;
};

type LinkedInDraft = {
  status?: LinkedInImportStatus;
  url?: string;
  profile_text?: string;
  hint?: string;
  error?: string;
  extracted?: Record<string, unknown>;
};

const steps: { key: StepKey; label: string }[] = [
  { key: "cv", label: "Grunnlag" },
  { key: "questions", label: "Retning" },
  { key: "review", label: "Matchprofil" },
  { key: "chat", label: "Finjuster" },
  { key: "setup", label: "Første matcher" },
];

const categoryLabels: Record<SignalDraft["category"], string> = {
  role: "Rolle",
  industry: "Bransje",
  task: "Oppgave",
  skill: "Ferdighet",
  value: "Verdi",
  work_style: "Arbeidsform",
  location: "Sted",
  dealbreaker: "Dealbreaker",
  other: "Annet",
};

const setupLabels: Record<string, string> = {
  linkedin: "Sjekker LinkedIn",
  cv: "Lagrer CV",
  profile: "Lagrer profil",
  sources: "Lager kildeforslag",
  finnRss: "FINN RSS",
  arbeidsplassen: "Henter Arbeidsplassen",
  matching: "Matcher jobber",
};

const INITIAL_SETUP_MATCH_LIMIT = 6;
const BACKGROUND_SETUP_MATCH_LIMIT = 30;
const SETUP_MATCH_PREVIEW_LIMIT = 6;

const emptySetupState: SetupState = {
  linkedin: { status: "pending" },
  cv: { status: "pending" },
  profile: { status: "pending" },
  sources: { status: "pending" },
  finnRss: { status: "pending" },
  arbeidsplassen: { status: "pending" },
  matching: { status: "pending" },
};

const freshSetupState = (): SetupState => ({
  linkedin: { status: "pending" },
  cv: { status: "pending" },
  profile: { status: "pending" },
  sources: { status: "pending" },
  finnRss: { status: "pending" },
  arbeidsplassen: { status: "pending" },
  matching: { status: "pending" },
});

const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const fileToText = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });

const answerPayload = (questions: Question[], answers: Record<string, string>) => ({
  questions,
  values: answers,
});

const parseAnswerPayload = (payload: any): { questions: Question[]; answers: Record<string, string> } => ({
  questions: Array.isArray(payload?.questions) ? payload.questions : [],
  answers: payload?.values && typeof payload.values === "object" ? payload.values : {},
});

const chatMessageId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const createChatMessage = (
  role: OnboardingChatMessage["role"],
  content: string,
  change_summary?: string,
): OnboardingChatMessage => ({
  id: chatMessageId(),
  role,
  content,
  created_at: new Date().toISOString(),
  ...(change_summary ? { change_summary } : {}),
});

const normalizeChatMessages = (messages: any): OnboardingChatMessage[] => {
  if (!Array.isArray(messages)) return [];
  return messages
    .flatMap((message: any) => {
      const role = message?.role === "user" || message?.role === "assistant" ? message.role : null;
      const content = String(message?.content ?? "").trim();
      if (!role || !content) return [];
      return [{
        id: String(message.id ?? chatMessageId()),
        role,
        content,
        created_at: String(message.created_at ?? new Date().toISOString()),
        change_summary: message.change_summary ? String(message.change_summary) : undefined,
      }];
    })
    .slice(-40);
};

const normalizeCv = (cv: any): CvDraft => ({
  ...cv,
  intro: cv?.intro ?? "",
  experiences: Array.isArray(cv?.experiences) ? cv.experiences : [],
  education: Array.isArray(cv?.education) ? cv.education : [],
  skills: Array.isArray(cv?.skills) ? cv.skills : [],
  languages: Array.isArray(cv?.languages) ? cv.languages : [],
  projects: Array.isArray(cv?.projects) ? cv.projects : [],
  certifications: Array.isArray(cv?.certifications) ? cv.certifications : [],
});

const cvPayload = (userId: string, cv: CvDraft) => ({
  user_id: userId,
  is_active: true,
  cv_style: cv.cv_style ?? "skandinavisk",
  full_name: cv.full_name ?? null,
  headline: cv.headline ?? null,
  email: cv.email ?? null,
  phone: cv.phone ?? null,
  location: cv.location ?? null,
  linkedin_url: cv.linkedin_url ?? null,
  website_url: cv.website_url ?? null,
  photo_url: cv.photo_url ?? null,
  intro: cv.intro ?? "",
  experiences: cv.experiences ?? [],
  education: cv.education ?? [],
  skills: cv.skills ?? [],
  languages: cv.languages ?? [],
  projects: cv.projects ?? [],
  certifications: cv.certifications ?? [],
});

const Onboarding = () => {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const rerun = searchParams.get("rerun") === "1";

  const [loading, setLoading] = useState(true);
  const [runId, setRunId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<StepKey>("cv");
  const [profile, setProfile] = useState<any>(null);
  const [cvDraft, setCvDraft] = useState<CvDraft | null>(null);
  const [cvText, setCvText] = useState("");
  const [importingCv, setImportingCv] = useState(false);
  const [preauthDraft, setPreauthDraft] = useState<PreOnboardingDraft | null>(null);
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [linkedinDraft, setLinkedinDraft] = useState<LinkedInDraft | null>(null);
  const [importingLinkedIn, setImportingLinkedIn] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [showOptionalQuestions, setShowOptionalQuestions] = useState(false);
  const [generatingQuestions, setGeneratingQuestions] = useState(false);
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [chatMessages, setChatMessages] = useState<OnboardingChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [refiningDraft, setRefiningDraft] = useState(false);
  const [newSignalLabel, setNewSignalLabel] = useState("");
  const [newSignalCategory, setNewSignalCategory] = useState<SignalDraft["category"]>("skill");
  const [matchPriority, setMatchPriority] = useState<MatchPriority>("balanced");
  const [showAdvancedWeights, setShowAdvancedWeights] = useState(false);
  const [saving, setSaving] = useState(false);
  const [setupState, setSetupState] = useState<SetupState>(freshSetupState);
  const [setupDone, setSetupDone] = useState(false);
  const [setupMatches, setSetupMatches] = useState<SetupMatchPreview[]>([]);
  const [setupSourceSuggestions, setSetupSourceSuggestions] = useState<OnboardingSourceSuggestion[]>([]);
  const [setupFinnRssName, setSetupFinnRssName] = useState("");
  const [setupFinnRssUrl, setSetupFinnRssUrl] = useState("");
  const [setupFinnRssSaving, setSetupFinnRssSaving] = useState(false);
  const [continuingMatching, setContinuingMatching] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const mountedRef = useRef(true);

  const currentStepIndex = steps.findIndex((step) => step.key === currentStep);
  const progress = Math.round(((currentStepIndex + 1) / steps.length) * 100);
  const setupMatchingStatus = setupState.matching?.status ?? "pending";

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadSetupMatches = useCallback(async () => {
    if (!user) return [];
    const { data, error } = await (supabase as any)
      .from("user_job_matches")
      .select("id, match_score, status, match_reasoning, external_jobs(title, company, location, provider, source_url, deadline, raw_data)")
      .eq("user_id", user.id)
      .neq("status", "dismissed")
      .neq("status", "archived")
      .order("match_score", { ascending: false, nullsFirst: false })
      .limit(SETUP_MATCH_PREVIEW_LIMIT);

    if (error) return [];
    const rows = ((data ?? []) as SetupMatchPreview[]).filter((match) => typeof match.match_score === "number");
    if (mountedRef.current) setSetupMatches(rows);
    return rows;
  }, [user]);

  const loadSetupSourceSuggestions = useCallback(async () => {
    if (!user) return [];
    const { data, error } = await (supabase as any)
      .from("source_suggestions")
      .select("id, provider, name, query, location, search_url, reason")
      .eq("user_id", user.id)
      .eq("provider", "finn")
      .neq("status", "dismissed")
      .order("confidence", { ascending: false })
      .limit(4);

    if (error) return [];
    const rows = (data ?? []) as OnboardingSourceSuggestion[];
    if (mountedRef.current) setSetupSourceSuggestions(rows);
    return rows;
  }, [user]);

  useEffect(() => {
    if (!user) return;
    loadInitial();
    // The initial loader intentionally runs once per user/rerun mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, rerun]);

  useEffect(() => {
    if (currentStep === "chat") {
      chatEndRef.current?.scrollIntoView({ block: "end" });
    }
  }, [chatMessages.length, currentStep, refiningDraft]);

  useEffect(() => {
    if (!user || currentStep !== "setup") return;
    let cancelled = false;
    const refreshMatches = async () => {
      if (!cancelled) await loadSetupMatches();
    };

    void loadSetupSourceSuggestions();
    void refreshMatches();
    if (setupMatchingStatus !== "running" && !continuingMatching) return;

    const interval = window.setInterval(refreshMatches, 1800);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [user, currentStep, setupMatchingStatus, continuingMatching, loadSetupMatches, loadSetupSourceSuggestions]);

  const persistRun = async (patch: Record<string, unknown>) => {
    if (!user) return null;
    if (runId) {
      const { error } = await (supabase as any).from("profile_onboarding_runs").update(patch).eq("id", runId);
      if (error) throw error;
      return runId;
    }
    const { data, error } = await (supabase as any)
      .from("profile_onboarding_runs")
      .insert({ user_id: user.id, ...patch })
      .select("id")
      .maybeSingle();
    if (error) throw error;
    setRunId(data?.id ?? null);
    return data?.id ?? null;
  };

  const loadInitial = async () => {
    if (!user) return;
    setLoading(true);
    const localPreauth = loadPreOnboardingDraft();

    const [profileRes, cvRes, runRes] = await Promise.all([
      (supabase as any)
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle(),
      (supabase as any)
        .from("cv_templates")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle(),
      rerun
        ? Promise.resolve({ data: null })
        : (supabase as any)
            .from("profile_onboarding_runs")
            .select("*")
            .eq("user_id", user.id)
            .is("completed_at", null)
            .neq("status", "skipped")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
    ]);

    const existingProfile = profileRes.data;
    const existingCv = cvRes.data ? normalizeCv(cvRes.data) : null;
    setProfile(existingProfile);

    if (runRes.data) {
      const payload = parseAnswerPayload(runRes.data.answers);
      const runPreauth = Object.keys(runRes.data.preauth_draft ?? {}).length
        ? runRes.data.preauth_draft
        : localPreauth;
      const runLinkedIn = Object.keys(runRes.data.linkedin_draft ?? {}).length
        ? runRes.data.linkedin_draft
        : runPreauth?.linkedinUrl
        ? { url: runPreauth.linkedinUrl, status: "pending" }
        : null;
      setRunId(runRes.data.id);
      setCurrentStep(runRes.data.current_step ?? "cv");
      setCvDraft(Object.keys(runRes.data.cv_draft ?? {}).length ? normalizeCv(runRes.data.cv_draft) : existingCv);
      setPreauthDraft(runPreauth ?? null);
      setLinkedinUrl(runLinkedIn?.url ?? existingProfile?.linkedin_url ?? runPreauth?.linkedinUrl ?? "");
      setLinkedinDraft(runLinkedIn);
      setQuestions(payload.questions.length ? payload.questions : hasUsefulPreOnboardingDraft(runPreauth) ? questionsFromPreOnboardingDraft() : []);
      setAnswers({
        ...(hasUsefulPreOnboardingDraft(runPreauth) ? answersFromPreOnboardingDraft(runPreauth) : {}),
        ...payload.answers,
      });
      setDraft(Object.keys(runRes.data.profile_draft ?? {}).length ? runRes.data.profile_draft : null);
      setChatMessages(normalizeChatMessages(runRes.data.chat_messages));
      if (Object.keys(runRes.data.setup_state ?? {}).length) setSetupState({ ...freshSetupState(), ...runRes.data.setup_state });
      setLoading(false);
      return;
    }

    const initialPreauth = localPreauth ?? null;
    const initialQuestions = hasUsefulPreOnboardingDraft(initialPreauth) ? questionsFromPreOnboardingDraft() : [];
    const initialAnswers = hasUsefulPreOnboardingDraft(initialPreauth) ? answersFromPreOnboardingDraft(initialPreauth) : {};
    setCvDraft(existingCv);
    setPreauthDraft(initialPreauth);
    setLinkedinUrl(existingProfile?.linkedin_url ?? initialPreauth?.linkedinUrl ?? "");
    setLinkedinDraft(initialPreauth?.linkedinUrl ? { url: initialPreauth.linkedinUrl, status: "pending" } : null);
    setQuestions(initialQuestions);
    setAnswers(initialAnswers);
    setChatMessages([]);
    const { data, error } = await (supabase as any)
      .from("profile_onboarding_runs")
      .insert({
        user_id: user.id,
        current_step: "cv",
        status: "draft",
        cv_draft: existingCv ?? {},
        preauth_draft: initialPreauth ?? {},
        linkedin_draft: initialPreauth?.linkedinUrl ? { url: initialPreauth.linkedinUrl, status: "pending" } : {},
        answers: initialQuestions.length ? answerPayload(initialQuestions, initialAnswers) : {},
        chat_messages: [],
      })
      .select("id")
      .maybeSingle();
    if (!error) setRunId(data?.id ?? null);
    setLoading(false);
  };

  const updateStep = async (step: StepKey, status?: string) => {
    setCurrentStep(step);
    await persistRun({ current_step: step, ...(status ? { status } : {}) });
  };

  const importCv = async (kind: "text" | "file", file?: File) => {
    if (!user) return;
    setImportingCv(true);
    try {
      let body: Record<string, unknown>;
      if (kind === "file" && file) {
        if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
          body = { pdf_base64: await fileToBase64(file), mime_type: file.type || "application/pdf" };
        } else {
          body = { text: await fileToText(file) };
        }
      } else {
        if (cvText.trim().length < 40) {
          toast({ title: "Lim inn litt mer CV-tekst først", variant: "destructive" });
          return;
        }
        body = { text: cvText };
      }

      const { data, error } = await supabase.functions.invoke("import-cv", { body });
      if (error || !(data as any)?.cv) throw error ?? new Error("Tomt CV-svar");
      const next = normalizeCv((data as any).cv);
      setCvDraft(next);
      await persistRun({ cv_draft: next, status: "draft" });
      toast({ title: "CV lest", description: "Sjekk sammendraget før du går videre." });
    } catch (e: any) {
      toast({ title: "Kunne ikke lese CV", description: e.message, variant: "destructive" });
    } finally {
      setImportingCv(false);
    }
  };

  const importLinkedIn = async () => {
    const url = linkedinUrl.trim();
    if (!url) {
      toast({ title: "Lim inn LinkedIn-URL først", variant: "destructive" });
      return;
    }

    setImportingLinkedIn(true);
    const nextPreauth = { ...(preauthDraft ?? {}), linkedinUrl: url };
    setPreauthDraft(nextPreauth);
    savePreOnboardingDraft(nextPreauth);

    try {
      const { data, error } = await supabase.functions.invoke("import-linkedin", { body: { url } });
      if (error) throw error;
      const result = data as LinkedInDraft;
      setLinkedinDraft(result);
      await persistRun({
        preauth_draft: nextPreauth,
        linkedin_draft: result,
        status: "draft",
      });
      if (result.status === "ok") {
        toast({ title: "LinkedIn brukt som supplement", description: "Offentlig tekst er hentet inn i profilgrunnlaget." });
      } else {
        toast({
          title: "LinkedIn lagret som hint",
          description: result.hint ?? "LinkedIn lot seg ikke hente direkte.",
        });
      }
    } catch (e: any) {
      const result = { status: "error" as const, url, error: e.message, hint: "URL-en er lagret som hint." };
      setLinkedinDraft(result);
      await persistRun({ preauth_draft: nextPreauth, linkedin_draft: result, status: "draft" }).catch(() => undefined);
      toast({ title: "Kunne ikke hente LinkedIn", description: e.message, variant: "destructive" });
    } finally {
      setImportingLinkedIn(false);
    }
  };

  const generateQuestions = async () => {
    setGeneratingQuestions(true);
    try {
      const { data, error } = await supabase.functions.invoke("profile-onboarding-ai", {
        body: {
          action: "generate_questions",
          cv: cvDraft,
          profile,
          preauth_draft: preauthDraft,
          linkedin_draft: linkedinDraft,
        },
      });
      if (error) throw error;
      const next = Array.isArray((data as any)?.questions) ? ((data as any).questions as Question[]) : [];
      setQuestions(next);
      setAnswers((prev) => {
        const preserved = Object.fromEntries(Object.entries(prev).filter(([key]) => next.some((q) => q.id === key)));
        persistRun({ answers: answerPayload(next, preserved), status: "questions", current_step: "questions" }).catch(() => undefined);
        return preserved;
      });
    } catch (e: any) {
      toast({ title: "Kunne ikke lage spørsmål", description: e.message, variant: "destructive" });
    } finally {
      setGeneratingQuestions(false);
    }
  };

  const continueToQuestions = async () => {
    await updateStep("questions", "questions");
    if (questions.length === 0) await generateQuestions();
  };

  const updateAnswer = (id: string, value: string) => {
    const next = { ...answers, [id]: value };
    setAnswers(next);
    persistRun({ answers: answerPayload(questions, next), status: "questions" }).catch(() => undefined);
  };

  const visibleQuestions = useMemo(
    () => (showOptionalQuestions ? questions : questions.slice(0, 3)),
    [questions, showOptionalQuestions],
  );

  const requiredMissing = useMemo(
    () => questions.slice(0, 3).some((q) => q.required && !answers[q.id]?.trim()),
    [questions, answers],
  );

  const generateDraft = async () => {
    setGeneratingDraft(true);
    try {
      await persistRun({ answers: answerPayload(questions, answers), status: "questions" });
      const { data, error } = await supabase.functions.invoke("profile-onboarding-ai", {
        body: {
          action: "generate_profile_draft",
          cv: cvDraft,
          profile,
          preauth_draft: preauthDraft,
          linkedin_draft: linkedinDraft,
          questions,
          answers,
        },
      });
      if (error) throw error;
      const next = (data as any)?.draft as ProfileDraft;
      setDraft(next);
      setChatMessages([]);
      await persistRun({ profile_draft: next, chat_messages: [], current_step: "review", status: "review" });
      setCurrentStep("review");
    } catch (e: any) {
      toast({ title: "Kunne ikke lage profilutkast", description: e.message, variant: "destructive" });
    } finally {
      setGeneratingDraft(false);
    }
  };

  const updateDraft = (patch: Partial<ProfileDraft>) => {
    if (!draft) return;
    const next = { ...draft, ...patch };
    setDraft(next);
    persistRun({ profile_draft: next, status: "review" }).catch(() => undefined);
  };

  const updateDraftWeight = (key: keyof ProfileDraft["weights"], value: number) => {
    if (!draft) return;
    updateDraft({ weights: { ...draft.weights, [key]: value } });
  };

  const applyMatchPriority = (priority: MatchPriority) => {
    setMatchPriority(priority);
    if (!draft) return;
    updateDraft({ weights: weightsFromPriority(priority) });
  };

  const startAssistantChat = async () => {
    if (!draft) return;
    const nextMessages = chatMessages.length
      ? chatMessages
      : [
          createChatMessage(
            "assistant",
            "Jeg har laget en første matchprofil. Skriv hva som ikke stemmer, hva du vil legge til, eller hvilke jobber du egentlig vil mot. Så oppdaterer jeg profilen før vi finner de første matchene.",
          ),
        ];
    setChatMessages(nextMessages);
    setCurrentStep("chat");
    try {
      await persistRun({
        current_step: "chat",
        status: "review",
        profile_draft: draft,
        chat_messages: nextMessages,
      });
    } catch (e: any) {
      toast({ title: "Kunne ikke lagre chat-steget", description: e.message, variant: "destructive" });
    }
  };

  const sendChatMessage = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!draft || refiningDraft) return;
    const content = chatInput.trim();
    if (!content) return;

    const userMessage = createChatMessage("user", content);
    const nextMessages = [...chatMessages, userMessage];
    setChatInput("");
    setChatMessages(nextMessages);
    setRefiningDraft(true);

    try {
      await persistRun({
        current_step: "chat",
        status: "review",
        profile_draft: draft,
        chat_messages: nextMessages,
      });

      const { data, error } = await supabase.functions.invoke("profile-onboarding-ai", {
        body: {
          action: "refine_profile_draft",
          cv: cvDraft,
          profile,
          preauth_draft: preauthDraft,
          linkedin_draft: linkedinDraft,
          questions,
          answers,
          draft,
          messages: chatMessages,
          user_message: content,
        },
      });
      if (error) throw error;

      const nextDraft = (data as any)?.draft as ProfileDraft | undefined;
      const reply = String((data as any)?.reply ?? "").trim();
      if (!nextDraft || !reply) throw new Error("Assistenten svarte uten oppdatert kartlegging");

      const assistantMessage = createChatMessage("assistant", reply, (data as any)?.change_summary);
      const updatedMessages = [...nextMessages, assistantMessage];
      setDraft(nextDraft);
      setChatMessages(updatedMessages);
      await persistRun({
        current_step: "chat",
        status: "review",
        profile_draft: nextDraft,
        chat_messages: updatedMessages,
      });
    } catch (e: any) {
      toast({
        title: "Kunne ikke oppdatere kartleggingen",
        description: e.message ?? "Prøv igjen om litt. Utkastet ditt er ikke overskrevet.",
        variant: "destructive",
      });
    } finally {
      setRefiningDraft(false);
    }
  };

  const updateSignal = (index: number, patch: Partial<SignalDraft>) => {
    if (!draft) return;
    const signals = draft.signals.map((signal, i) => (i === index ? { ...signal, ...patch } : signal));
    updateDraft({ signals });
  };

  const addSignal = () => {
    if (!draft || !newSignalLabel.trim()) return;
    updateDraft({
      signals: [
        ...draft.signals,
        {
          label: newSignalLabel.trim(),
          category: newSignalCategory,
          weight: newSignalCategory === "dealbreaker" ? -80 : 70,
          confidence: 1,
          reason: "Lagt til i review",
        },
      ],
    });
    setNewSignalLabel("");
  };

  const removeSignal = (index: number) => {
    if (!draft) return;
    updateDraft({ signals: draft.signals.filter((_, i) => i !== index) });
  };

  const setSetupItem = (key: string, status: SetupState[string]["status"], detail?: string) => {
    if (!mountedRef.current) return;
    setSetupState((prev) => {
      const next = { ...prev, [key]: { status, detail } };
      persistRun({ setup_state: next }).catch(() => undefined);
      return next;
    });
  };

  const copySetupSuggestionSearch = async (suggestion: OnboardingSourceSuggestion) => {
    const text = buildSourceSearchText(suggestion.query, suggestion.location);
    await navigator.clipboard.writeText(text);
    toast({ title: "Søketekst kopiert", description: text });
  };

  const saveSetupFinnRss = async () => {
    if (!user) return;
    const url = setupFinnRssUrl.trim();
    if (!url) {
      toast({ title: "Lim inn RSS-lenke fra FINN først", variant: "destructive" });
      return;
    }

    setSetupFinnRssSaving(true);
    setSetupItem("finnRss", "running", "Kobler FINN RSS og sjekker treff.");
    try {
      const fallbackName = setupSourceSuggestions[0]?.name ?? "FINN lagret søk";
      const { error: insertError } = await (supabase as any).from("rss_feeds").insert({
        user_id: user.id,
        name: setupFinnRssName.trim() || fallbackName,
        url,
      });
      if (insertError) throw insertError;

      const { data: finnData, error: finnError } = await supabase.functions.invoke("ingest-finn", {
        body: { includeUserFeeds: true, includeOfficialApi: true, includeHtmlSuggestions: false, userId: user.id },
      });
      if (finnError) throw finnError;

      const { error: matchError } = await supabase.functions.invoke("match-user-jobs", {
        body: { provider: "finn", limit: 12, includeBroadCache: true, autoSaveVisible: true, materializeExisting: true },
      });
      if (matchError) throw matchError;

      await loadSetupMatches();
      setSetupFinnRssName("");
      setSetupFinnRssUrl("");
      setSetupItem("finnRss", "done", `${(finnData as any)?.upserted ?? 0} FINN-jobber sjekket via RSS/API.`);
      toast({ title: "FINN RSS koblet", description: "Vi sjekket feeden og oppdaterte matchene dine." });
    } catch (e: any) {
      setSetupItem("finnRss", "error", e.message);
      toast({ title: "Kunne ikke koble FINN RSS", description: e.message, variant: "destructive" });
    } finally {
      setSetupFinnRssSaving(false);
    }
  };

  const saveCvDraft = async () => {
    if (!user || !cvDraft) return;
    setSetupItem("cv", "running");
    const payload = cvPayload(user.id, cvDraft);
    const existingId = cvDraft.id
      ? cvDraft.id
      : (
          await (supabase as any)
            .from("cv_templates")
            .select("id")
            .eq("user_id", user.id)
            .order("is_default", { ascending: false })
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle()
        ).data?.id;

    if (existingId) {
      const { error } = await (supabase as any)
        .from("cv_templates")
        .update({ ...payload, variant_name: "Standard", is_default: true })
        .eq("id", existingId);
      if (error) throw error;
    } else {
      // First-time onboarding CV becomes the user's default variant.
      await (supabase as any).from("cv_templates").update({ is_default: false }).eq("user_id", user.id);
      const { error } = await (supabase as any)
        .from("cv_templates")
        .insert({ ...payload, variant_name: "Standard", is_default: true });
      if (error) throw error;
    }
    setSetupItem("cv", "done");
  };

  const saveProfileDraft = async () => {
    if (!user || !draft) return;
    setSetupItem("profile", "running");
    const now = new Date().toISOString();
    const normalizedWeights = normalizeWeights(draft.weights);
    const { error: profileError } = await (supabase as any).from("profiles").upsert(
      {
        user_id: user.id,
        email: user.email,
        display_name: profile?.display_name ?? cvDraft?.full_name ?? user.email?.split("@")[0] ?? null,
        linkedin_url: linkedinUrl || profile?.linkedin_url || cvDraft?.linkedin_url || null,
        master_profile: draft.master_profile,
        style_guide: draft.style_guide,
        weight_professional: normalizedWeights.professional,
        weight_culture: normalizedWeights.culture,
        weight_practical: normalizedWeights.practical,
        weight_enthusiasm: normalizedWeights.enthusiasm,
        rules_green: draft.rules_green,
        rules_yellow: draft.rules_yellow,
        rules_red: draft.rules_red,
        weekly_goal: profile?.weekly_goal ?? 5,
        onboarding_completed_at: now,
        onboarding_skipped_at: null,
      },
      { onConflict: "user_id" },
    );
    if (profileError) throw profileError;

    await (supabase as any)
      .from("profile_interest_signals")
      .delete()
      .eq("user_id", user.id)
      .eq("source", "ai_suggested")
      .contains("metadata", { origin: "onboarding" });

    const seenSignals = new Set<string>();
    const signals = draft.signals
      .filter((signal) => signal.label.trim())
      .filter((signal) => {
        const key = `${signal.label.trim().toLowerCase()}|${signal.category}`;
        if (seenSignals.has(key)) return false;
        seenSignals.add(key);
        return true;
      })
      .map((signal) => ({
        user_id: user.id,
        label: signal.label.trim(),
        category: signal.category,
        weight: Math.max(-100, Math.min(100, Math.round(Number(signal.weight) || 0))),
        confidence: Math.max(0, Math.min(1, Number(signal.confidence) || 0.75)),
        source: "ai_suggested",
        metadata: {
          origin: "onboarding",
          onboarding_run_id: runId,
          reason: signal.reason ?? null,
        },
      }));

    if (signals.length) {
      const { error: signalsError } = await (supabase as any)
        .from("profile_interest_signals")
        .upsert(signals, { onConflict: "user_id,label,category" });
      if (signalsError) throw signalsError;
    }

    await persistRun({
      status: "completed",
      current_step: "setup",
      profile_draft: draft,
      chat_messages: chatMessages,
      completed_at: now,
    });
    setSetupItem("profile", "done");
  };

  const approveAndSetup = async () => {
    if (!draft || !user) return;
    setSaving(true);
    const initialSetup = freshSetupState();
    setSetupState(initialSetup);
    setSetupDone(false);
    setSetupMatches([]);
    setContinuingMatching(false);
    await updateStep("setup", "applying");
    await persistRun({ setup_state: initialSetup });

    try {
      if (linkedinUrl || linkedinDraft?.url) {
        setSetupItem("linkedin", "done", linkedinDraft?.hint ?? "LinkedIn brukes som hint.");
      } else {
        setSetupItem("linkedin", "done", "Hoppet over LinkedIn");
      }
      if (cvDraft) await saveCvDraft();
      else setSetupItem("cv", "done", "Hoppet over CV");

      await saveProfileDraft();

      setSetupItem("sources", "running");
      try {
        await supabase.functions.invoke("suggest-source-feeds", { body: { force: true } });
        const suggestions = await loadSetupSourceSuggestions();
        setSetupItem("sources", "done", suggestions.length ? `${suggestions.length} FINN-søk foreslått.` : "Kildeforslag forsøkt opprettet.");
      } catch (e: any) {
        setSetupItem("sources", "error", e.message);
      }

      setSetupItem("finnRss", "running", "Sjekker eventuelle FINN RSS-feeder.");
      try {
        const { data, error } = await supabase.functions.invoke("ingest-finn", {
          body: { includeUserFeeds: true, includeOfficialApi: true, includeHtmlSuggestions: false, userId: user.id },
        });
        if (error) throw error;
        const upserted = (data as any)?.upserted ?? 0;
        setSetupItem(
          "finnRss",
          "done",
          upserted > 0 ? `${upserted} FINN-jobber oppdatert via RSS/API.` : "Valgfritt: legg inn RSS fra lagrede FINN-søk nå eller senere.",
        );
      } catch (e: any) {
        setSetupItem("finnRss", "done", "FINN RSS kan legges inn senere uten at matching stopper.");
      }

      setSetupItem("arbeidsplassen", "running");
      try {
        await supabase.functions.invoke("ingest-arbeidsplassen-feed", { body: { maxPages: 5, sinceDays: 30 } });
        setSetupItem("arbeidsplassen", "done");
      } catch (e: any) {
        setSetupItem("arbeidsplassen", "error", e.message);
      }

      let firstMatchingOk = false;
      setSetupItem("matching", "running");
      try {
        const { data, error } = await supabase.functions.invoke("match-user-jobs", {
          body: { limit: INITIAL_SETUP_MATCH_LIMIT, includeBroadCache: true, autoSaveVisible: true, materializeExisting: true },
        });
        if (error) throw error;
        const firstMatches = await loadSetupMatches();
        setSetupItem(
          "matching",
          "done",
          firstMatches.length > 0
            ? `${firstMatches.length} matcher klare nå`
            : `${(data as any)?.scored ?? 0} jobber scoret`,
        );
        firstMatchingOk = true;
      } catch (e: any) {
        setSetupItem("matching", "error", e.message);
      }

      setSetupDone(true);
      toast({
        title: firstMatchingOk ? "De første matchene er klare" : "Interesseprofilen er klar",
        description: firstMatchingOk ? "Vi fortsetter å finne flere i bakgrunnen." : "Du kan prøve matching igjen fra Jobber.",
      });

      const continueMatching = async () => {
        if (!mountedRef.current) return;
        setContinuingMatching(true);
        setSetupItem(
          "matching",
          "running",
          "Vi finner flere jobber til deg. De kommer fortløpende her.",
        );
        try {
          const { data, error } = await supabase.functions.invoke("match-user-jobs", {
            body: { limit: BACKGROUND_SETUP_MATCH_LIMIT, includeBroadCache: true, autoSaveVisible: true, materializeExisting: true },
          });
          if (error) throw error;
          const latestMatches = await loadSetupMatches();
          setSetupItem(
            "matching",
            "done",
            latestMatches.length > 0
              ? `${latestMatches.length} matcher vises, flere ligger i jobblisten`
              : `${(data as any)?.scored ?? 0} nye jobber scoret`,
          );
        } catch (e: any) {
          setSetupItem("matching", "error", e.message);
        } finally {
          if (mountedRef.current) setContinuingMatching(false);
        }
      };
      if (firstMatchingOk) void continueMatching();
    } catch (e: any) {
      toast({ title: "Kunne ikke lagre onboarding", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const skipOnboarding = async () => {
    if (!user) return;
    const now = new Date().toISOString();
    await (supabase as any).from("profiles").upsert(
      {
        user_id: user.id,
        email: user.email,
        display_name: profile?.display_name ?? user.email?.split("@")[0] ?? null,
        onboarding_skipped_at: now,
      },
      { onConflict: "user_id" },
    );
    if (runId) {
      await (supabase as any)
        .from("profile_onboarding_runs")
        .update({ status: "skipped", completed_at: now })
        .eq("id", runId);
    }
    navigate("/", { replace: true });
  };

  const signOutAndLeave = async () => {
    await signOut();
    navigate("/start", { replace: true });
  };

  const canOpenMatches = setupDone || setupMatches.length > 0;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-subtle">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Laster onboarding...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <header className="border-b border-border/70 bg-background/85 backdrop-blur sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-gradient-primary flex items-center justify-center shadow-elevated shrink-0">
              <Sparkles className="w-4 h-4 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold">Bygg matchprofil</div>
              <div className="text-xs text-muted-foreground truncate">
                {rerun ? "Juster oppsettet på nytt" : "Første oppsett for bedre matcher"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={skipOnboarding}>
              Gjør senere
            </Button>
            <Button variant="ghost" size="icon" onClick={signOutAndLeave} aria-label="Logg ut">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 md:p-6 lg:p-10 space-y-7">
        <section className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
          <aside className="space-y-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Jobbene som passer, raskere</h1>
              <p className="text-sm text-muted-foreground mt-2">
                Start med det du har. Du kan bruke CV, LinkedIn eller bare retningen du skrev inn.
              </p>
            </div>
            <Card>
              <CardContent className="p-4 space-y-4">
                <Progress value={progress} />
                <div className="space-y-2">
                  {steps.map((step, index) => {
                    const active = step.key === currentStep;
                    const done = index < currentStepIndex;
                    return (
                      <div key={step.key} className="flex items-center gap-2 text-sm">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${active ? "bg-primary text-primary-foreground" : done ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground"}`}>
                          {done ? <Check className="w-3.5 h-3.5" /> : index + 1}
                        </div>
                        <span className={active ? "font-medium" : "text-muted-foreground"}>{step.label}</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </aside>

          {currentStep === "cv" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="w-5 h-5 text-primary" />
                  Grunnlag
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  CV gir best faktagrunnlag. LinkedIn kan brukes som hint, og du kan også fortsette med svarene fra startsteget.
                </p>
              </CardHeader>
              <CardContent className="space-y-6">
                {(preauthDraft?.targetRoles || preauthDraft?.desiredTasks || preauthDraft?.location) && (
                  <div className="rounded-md border border-primary/20 bg-primary/5 p-4 space-y-2">
                    <div className="text-sm font-semibold">Dette tar vi med fra startsteget</div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                      <MiniText label="Leter etter" value={preauthDraft?.targetRoles} />
                      <MiniText label="Oppgaver" value={preauthDraft?.desiredTasks} />
                      <MiniText label="Rammer" value={preauthDraft?.location} />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="rounded-md border border-dashed border-border p-5 hover:bg-accent/40 transition-colors cursor-pointer">
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.txt,.md,text/plain,application/pdf"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) importCv("file", file);
                        e.target.value = "";
                      }}
                    />
                    <Upload className="w-5 h-5 text-primary mb-3" />
                    <div className="font-medium text-sm">Last opp CV</div>
                    <p className="text-xs text-muted-foreground mt-1">PDF, TXT eller Markdown.</p>
                  </label>
                  <div className="rounded-md border border-border p-4 space-y-3">
                    <Label>Lim inn CV-tekst</Label>
                    <Textarea
                      rows={6}
                      value={cvText}
                      onChange={(e) => setCvText(e.target.value)}
                      placeholder="Lim inn CV-teksten din her..."
                    />
                    <Button variant="outline" onClick={() => importCv("text")} disabled={importingCv || !cvText.trim()}>
                      {importingCv ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wand2 className="w-4 h-4 mr-2" />}
                      Les CV-tekst
                    </Button>
                  </div>
                </div>

                {importingCv && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" /> Leser og strukturerer CV-en...
                  </div>
                )}

                {cvDraft && <CvSummary cv={cvDraft} />}

                <div className="rounded-md border border-border bg-background p-4 space-y-3">
                  <div>
                    <Label htmlFor="linkedin-url">LinkedIn som supplement</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Vi prøver å hente offentlig tekst. Hvis LinkedIn blokkerer, lagres URL-en bare som et hint.
                    </p>
                  </div>
                  <div className="flex flex-col md:flex-row gap-2">
                    <Input
                      id="linkedin-url"
                      value={linkedinUrl}
                      onChange={(event) => {
                        setLinkedinUrl(event.target.value);
                        const next = { ...(preauthDraft ?? {}), linkedinUrl: event.target.value };
                        setPreauthDraft(next);
                        savePreOnboardingDraft(next);
                      }}
                      placeholder="https://linkedin.com/in/..."
                    />
                    <Button variant="outline" onClick={importLinkedIn} disabled={importingLinkedIn || !linkedinUrl.trim()}>
                      {importingLinkedIn ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ExternalLink className="w-4 h-4 mr-2" />}
                      Bruk LinkedIn
                    </Button>
                  </div>
                  {linkedinDraft && (
                    <div className="rounded-md bg-muted/60 p-3 text-sm">
                      <div className="font-medium">
                        {linkedinImportStatusCopy(linkedinDraft.status, linkedinDraft.hint ?? linkedinDraft.error).title}
                      </div>
                      <p className="text-muted-foreground mt-1">
                        {linkedinImportStatusCopy(linkedinDraft.status, linkedinDraft.hint ?? linkedinDraft.error ?? linkedinDraft.url).detail}
                      </p>
                      {linkedinDraft.profile_text && (
                        <p className="text-xs text-muted-foreground mt-2 line-clamp-3 whitespace-pre-line">{linkedinDraft.profile_text}</p>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <Button variant="ghost" onClick={() => setCvDraft(null)} disabled={!cvDraft}>
                    Fjern CV-utkast
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={continueToQuestions} disabled={generatingQuestions}>
                      Fortsett uten CV
                    </Button>
                    <Button onClick={continueToQuestions} disabled={generatingQuestions}>
                      {generatingQuestions ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ArrowRight className="w-4 h-4 mr-2" />}
                      Fortsett med retning
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {currentStep === "questions" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Target className="w-5 h-5 text-primary" />
                  Retning
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Svar kort. Dette styrer hvilke jobber som løftes frem og hvilke som skjules.
                </p>
              </CardHeader>
              <CardContent className="space-y-5">
                {generatingQuestions ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" /> Lager spørsmål fra CV-en...
                  </div>
                ) : questions.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border p-8 text-center">
                    <p className="text-sm text-muted-foreground">Ingen spørsmål klare ennå.</p>
                    <Button className="mt-4" onClick={generateQuestions}>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Lag spørsmål
                    </Button>
                  </div>
                ) : (
                  <>
                    {visibleQuestions.map((question, index) => (
                      <div key={question.id} className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Label className="text-sm">{question.title}</Label>
                          {index < 3 && question.required && <Badge variant="secondary">Viktig</Badge>}
                        </div>
                        <p className="text-sm text-muted-foreground">{question.prompt}</p>
                        <Textarea
                          rows={3}
                          value={answers[question.id] ?? ""}
                          onChange={(e) => updateAnswer(question.id, e.target.value)}
                          placeholder={question.placeholder}
                        />
                        {question.helper && <p className="text-xs text-muted-foreground">{question.helper}</p>}
                      </div>
                    ))}
                    {questions.length > 3 && (
                      <Button variant="ghost" size="sm" onClick={() => setShowOptionalQuestions((value) => !value)}>
                        <ChevronDown className={`w-4 h-4 mr-2 transition-transform ${showOptionalQuestions ? "rotate-180" : ""}`} />
                        {showOptionalQuestions ? "Skjul ekstra detaljer" : `Vis ${questions.length - 3} ekstra detaljer`}
                      </Button>
                    )}
                  </>
                )}

                <div className="flex items-center justify-between gap-3 flex-wrap pt-2">
                  <Button variant="ghost" onClick={() => updateStep("cv", "draft")}>
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Tilbake
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={generateQuestions} disabled={generatingQuestions}>
                      Lag andre spørsmål
                    </Button>
                    <Button onClick={generateDraft} disabled={generatingDraft || questions.length === 0 || requiredMissing}>
                      {generatingDraft ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                      Lag matchprofil
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {currentStep === "review" && draft && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" />
                  Matchprofil
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Se over hva Søkly skal lete etter. Tall og finjusteringer kan endres senere.
                </p>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>Profiloppsummering</Label>
                  <Textarea
                    rows={14}
                    value={draft.master_profile}
                    onChange={(e) => updateDraft({ master_profile: e.target.value })}
                    className="font-mono text-sm"
                  />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <RuleField title="Grønn match" value={draft.rules_green} onChange={(value) => updateDraft({ rules_green: value })} />
                  <RuleField title="Gul match" value={draft.rules_yellow} onChange={(value) => updateDraft({ rules_yellow: value })} />
                  <RuleField title="Rød match" value={draft.rules_red} onChange={(value) => updateDraft({ rules_red: value })} />
                </div>

                <div className="space-y-2">
                  <Label>Skrivestil</Label>
                  <Textarea
                    rows={4}
                    value={draft.style_guide}
                    onChange={(e) => updateDraft({ style_guide: e.target.value })}
                    placeholder="Tone, do/don't og språk for søknader."
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <Label>Interesse-tags</Label>
                      <p className="text-xs text-muted-foreground mt-1">Positive vekter løfter matcher. Dealbreakers bør ha negativ vekt.</p>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        className="w-56"
                        value={newSignalLabel}
                        onChange={(e) => setNewSignalLabel(e.target.value)}
                        placeholder="Ny tag"
                      />
                      <Select value={newSignalCategory} onValueChange={(value) => setNewSignalCategory(value as SignalDraft["category"])}>
                        <SelectTrigger className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(categoryLabels).map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button variant="outline" onClick={addSignal} disabled={!newSignalLabel.trim()}>
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {draft.signals.map((signal, index) => (
                      <div key={`${signal.label}-${index}`} className="grid grid-cols-1 md:grid-cols-[1fr_150px_96px_auto] gap-2 items-center rounded-md border border-border bg-card p-3">
                        <Input value={signal.label} onChange={(e) => updateSignal(index, { label: e.target.value })} />
                        <Select value={signal.category} onValueChange={(value) => updateSignal(index, { category: value as SignalDraft["category"] })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(categoryLabels).map(([value, label]) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          min={-100}
                          max={100}
                          value={signal.weight}
                          onChange={(e) => updateSignal(index, { weight: parseInt(e.target.value, 10) || 0 })}
                        />
                        <Button variant="ghost" size="icon" onClick={() => removeSignal(index)} aria-label="Fjern tag">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-md border border-border bg-muted/20 p-4 space-y-3">
                  <div>
                    <Label>Hva skal veie mest?</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Dette gjør tallvektingen forståelig. Vi normaliserer fortsatt til 100 bak kulissene.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                    {[
                      { value: "balanced", label: "Balansert" },
                      { value: "professional", label: "Faglig treff" },
                      { value: "practical", label: "Praktiske rammer" },
                      { value: "culture", label: "Arbeidsmiljø" },
                      { value: "enthusiasm", label: "Motivasjon" },
                    ].map((item) => (
                      <Button
                        key={item.value}
                        type="button"
                        variant={matchPriority === item.value ? "default" : "outline"}
                        onClick={() => applyMatchPriority(item.value as MatchPriority)}
                      >
                        {item.label}
                      </Button>
                    ))}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setShowAdvancedWeights((value) => !value)}>
                    <ChevronDown className={`w-4 h-4 mr-2 transition-transform ${showAdvancedWeights ? "rotate-180" : ""}`} />
                    Avansert vekting
                  </Button>
                  {showAdvancedWeights && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <WeightField label="Fag" value={draft.weights.professional} onChange={(value) => updateDraftWeight("professional", value)} />
                      <WeightField label="Kultur" value={draft.weights.culture} onChange={(value) => updateDraftWeight("culture", value)} />
                      <WeightField label="Praktisk" value={draft.weights.practical} onChange={(value) => updateDraftWeight("practical", value)} />
                      <WeightField label="Motivasjon" value={draft.weights.enthusiasm} onChange={(value) => updateDraftWeight("enthusiasm", value)} />
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between gap-3 flex-wrap pt-2">
                  <Button variant="ghost" onClick={() => updateStep("questions", "questions")}>
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Tilbake
                  </Button>
                  <div className="flex gap-2 flex-wrap">
                    <Button variant="outline" onClick={startAssistantChat}>
                      <MessageSquare className="w-4 h-4 mr-2" />
                      Finjuster med assistent
                    </Button>
                    <Button onClick={approveAndSetup} disabled={saving}>
                      {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                      Finn mine første matcher
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {currentStep === "chat" && draft && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Bot className="w-5 h-5 text-primary" />
                  Finjuster med profilassistent
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Sjekk oppsummeringen og korriger retning, rammer og hva du faktisk vil søke etter.
                </p>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-5 items-start">
                  <MatchProfileSummary draft={draft} />

                  <div className="rounded-md border border-border bg-background min-h-[520px] xl:h-[640px] xl:max-h-[calc(100vh-220px)] flex flex-col overflow-hidden">
                    <div className="border-b border-border p-4">
                      <div className="text-sm font-semibold">Samtale</div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Skriv som du ville forklart retningen til en rådgiver.
                      </p>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                      {chatMessages.length === 0 && (
                        <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                          Skriv hva som mangler, hva som er feil, eller hvilken retning du vil spisse profilen mot.
                        </div>
                      )}
                      {chatMessages.map((message) => (
                        <ChatBubble key={message.id} message={message} />
                      ))}
                      {refiningDraft && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Oppdaterer kartleggingen...
                        </div>
                      )}
                      <div ref={chatEndRef} />
                    </div>

                    <form onSubmit={sendChatMessage} className="border-t border-border p-3 space-y-3">
                      <Textarea
                        rows={3}
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            void sendChatMessage();
                          }
                        }}
                        placeholder="f.eks. Jeg vil heller jobbe med produkt og kundebehov enn ren utvikling..."
                        disabled={refiningDraft || saving}
                      />
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs text-muted-foreground">Enter sender. Shift + Enter gir ny linje.</span>
                        <Button type="submit" size="sm" disabled={!chatInput.trim() || refiningDraft || saving}>
                          {refiningDraft ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                          Send
                        </Button>
                      </div>
                    </form>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 flex-wrap pt-2">
                  <Button variant="ghost" onClick={() => updateStep("review", "review")} disabled={saving || refiningDraft}>
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Tilbake
                  </Button>
                  <Button onClick={approveAndSetup} disabled={saving || refiningDraft}>
                    {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                    Finn mine første matcher
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {currentStep === "setup" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Wand2 className="w-5 h-5 text-primary" />
                  Finner første matcher
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Profilen lagres først. Kilder og matching kan feile uten at arbeidet ditt går tapt.
                </p>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  {Object.entries(setupState).map(([key, item]) => (
                    <div key={key} className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{setupLabels[key]}</div>
                        {item.detail && <div className="text-xs text-muted-foreground mt-0.5 truncate">{item.detail}</div>}
                      </div>
                      <SetupIcon status={item.status} />
                    </div>
                  ))}
                </div>

                <FinnRssSetupPanel
                  suggestions={setupSourceSuggestions}
                  rssName={setupFinnRssName}
                  rssUrl={setupFinnRssUrl}
                  saving={setupFinnRssSaving}
                  onNameChange={setSetupFinnRssName}
                  onUrlChange={setSetupFinnRssUrl}
                  onSave={saveSetupFinnRss}
                  onCopy={copySetupSuggestionSearch}
                />

                {(setupMatches.length > 0 || setupMatchingStatus === "running" || continuingMatching) && (
                  <div className="rounded-md border border-border bg-background p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold flex items-center gap-2">
                          <Briefcase className="w-4 h-4 text-primary" />
                          Første matcher
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {setupMatches.length > 0
                            ? "Vi finner flere jobber til deg. De kommer fortløpende her."
                            : "Ser gjennom de første jobbene som passer profilen din."}
                        </p>
                      </div>
                      {(setupMatchingStatus === "running" || continuingMatching) && (
                        <Badge variant="secondary" className="shrink-0">
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          Søker videre
                        </Badge>
                      )}
                    </div>

                    {setupMatches.length > 0 ? (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                        {setupMatches.map((match) => (
                          <SetupMatchCard key={match.id} match={match} />
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Første treff dukker opp her når de er scoret.
                      </div>
                    )}
                  </div>
                )}

                {setupDone && (
                  <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-4">
                    <div className="font-medium text-sm">Klar til å se matcher</div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {continuingMatching || setupMatchingStatus === "running"
                        ? "De første matchene er klare. Vi leter videre, og nye treff kommer inn fortløpende."
                        : "Interesseprofilen er lagret, kildeforslag er forsøkt opprettet, og første matchrunde er kjørt."}
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 flex-wrap">
                  <Button variant="outline" asChild>
                    <Link to="/portal">Dashboard</Link>
                  </Button>
                  {canOpenMatches ? (
                    <Button asChild>
                      <Link to="/jobs">
                        Se jobber <ArrowRight className="w-4 h-4 ml-2" />
                      </Link>
                    </Button>
                  ) : (
                    <Button disabled>
                      Se jobber <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </section>
      </main>
    </div>
  );
};

const extractMarkdownSection = (markdown: string | undefined, title: string) => {
  if (!markdown) return "";
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^#{1,3}\\s+${escaped}\\s*$([\\s\\S]*?)(?=^#{1,3}\\s+|\\s*$)`, "im");
  return markdown.match(re)?.[1]?.trim() ?? "";
};

const draftSection = (draft: ProfileDraft, key: string, title: string) =>
  draft.sections?.[key]?.trim() || extractMarkdownSection(draft.master_profile, title);

const MatchProfileSummary = ({ draft }: { draft: ProfileDraft }) => {
  const positiveSignals = draft.signals
    .filter((signal) => signal.weight > 0 && signal.category !== "dealbreaker")
    .sort((a, b) => b.weight - a.weight);
  const searchSignals = positiveSignals
    .filter((signal) => ["role", "industry", "task", "skill"].includes(signal.category))
    .slice(0, 10);
  const dealbreakerSignals = draft.signals
    .filter((signal) => signal.category === "dealbreaker" || signal.weight < 0)
    .sort((a, b) => a.weight - b.weight)
    .slice(0, 8);

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border bg-muted/20 p-4">
        <div className="text-xs font-medium uppercase text-muted-foreground">Oppsummering</div>
        <h2 className="text-xl font-semibold mt-2">Hvem du er og hvor du vil</h2>
        <p className="text-sm text-muted-foreground mt-2">
          Dette er profilen appen bruker når den foreslår søk, scorer jobber og lager søknadsutkast.
        </p>
      </div>

      <SummaryBlock title="Hvem du er" value={draftSection(draft, "about_me", "Om meg")} />
      <SummaryBlock title="Hva du vil" value={draftSection(draft, "looking_for", "Hva jeg ser etter")} />
      <SummaryBlock title="Hva du bør søke etter" value={draftSection(draft, "interests", "Interesser og sterke signaler")}>
        {searchSignals.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {searchSignals.map((signal) => (
              <Badge key={`${signal.category}-${signal.label}`} variant="secondary">
                {signal.label}
              </Badge>
            ))}
          </div>
        )}
      </SummaryBlock>
      <SummaryBlock title="Rammer" value={draftSection(draft, "constraints", "Rammer")} />
      <SummaryBlock title="Dealbreakers" value={draftSection(draft, "dealbreakers", "Dealbreakers")}>
        {dealbreakerSignals.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {dealbreakerSignals.map((signal) => (
              <Badge key={`${signal.category}-${signal.label}`} variant="destructive">
                {signal.label}
              </Badge>
            ))}
          </div>
        )}
      </SummaryBlock>

      <div className="rounded-md border border-border bg-card p-4 space-y-3">
        <div>
          <div className="text-sm font-semibold">Hvordan Søkly bør matche deg</div>
          <p className="text-sm text-muted-foreground mt-1 whitespace-pre-line">
            {draft.rules_green || "Treff på ønsket rolle, arbeidsoppgaver, ferdigheter og praktiske rammer."}
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <MiniStat label="Fag" value={draft.weights.professional} />
          <MiniStat label="Kultur" value={draft.weights.culture} />
          <MiniStat label="Praktisk" value={draft.weights.practical} />
          <MiniStat label="Entusiasme" value={draft.weights.enthusiasm} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
          <div className="rounded-md bg-muted/50 p-3">
            <div className="text-xs font-medium text-muted-foreground">Vurder nærmere</div>
            <p className="mt-1 whitespace-pre-line">{draft.rules_yellow || "Uklare krav, ansvar, sted eller arbeidsform."}</p>
          </div>
          <div className="rounded-md bg-muted/50 p-3">
            <div className="text-xs font-medium text-muted-foreground">Unngå</div>
            <p className="mt-1 whitespace-pre-line">{draft.rules_red || "Jobber som bryter med dealbreakers."}</p>
          </div>
        </div>
      </div>

      {positiveSignals.length > 0 && (
        <div className="rounded-md border border-border bg-card p-4">
          <div className="text-sm font-semibold">Interesse-tags</div>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {positiveSignals.slice(0, 16).map((signal) => (
              <Badge key={`${signal.category}-${signal.label}`} variant="outline">
                {categoryLabels[signal.category]}: {signal.label}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const FinnRssSetupPanel = ({
  suggestions,
  rssName,
  rssUrl,
  saving,
  onNameChange,
  onUrlChange,
  onSave,
  onCopy,
}: {
  suggestions: OnboardingSourceSuggestion[];
  rssName: string;
  rssUrl: string;
  saving: boolean;
  onNameChange: (value: string) => void;
  onUrlChange: (value: string) => void;
  onSave: () => void;
  onCopy: (suggestion: OnboardingSourceSuggestion) => void;
}) => (
  <div className="rounded-md border border-border bg-background p-4 space-y-4">
    <div className="flex items-start justify-between gap-3 flex-wrap">
      <div>
        <div className="text-sm font-semibold flex items-center gap-2">
          <Rss className="w-4 h-4 text-primary" />
          Legg inn dine FINN-søk
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          FINN er mest stabilt når du limer inn RSS fra lagrede søk. Du kan hoppe over dette og legge det inn senere.
        </p>
      </div>
      <Badge variant="outline" className="shrink-0">Valgfritt</Badge>
    </div>

    {suggestions.length > 0 && (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {suggestions.map((suggestion) => (
          <div key={suggestion.id} className="rounded-md border border-border bg-muted/30 p-3 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{suggestion.name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {buildSourceSearchText(suggestion.query, suggestion.location)}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" size="sm" onClick={() => onCopy(suggestion)} aria-label="Kopier søketekst">
                  <Copy className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" asChild>
                  <a href={suggestion.search_url} target="_blank" rel="noreferrer" aria-label="Åpne FINN-søk">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    )}

    <div className="grid grid-cols-1 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)_auto] gap-2 items-end">
      <div className="space-y-1">
        <Label className="text-[11px]">Navn</Label>
        <Input value={rssName} onChange={(event) => onNameChange(event.target.value)} placeholder="FINN - Produkt Oslo" />
      </div>
      <div className="space-y-1">
        <Label className="text-[11px]">RSS-lenke fra FINN</Label>
        <Input value={rssUrl} onChange={(event) => onUrlChange(event.target.value)} placeholder="https://www.finn.no/..." />
      </div>
      <Button onClick={onSave} disabled={saving || !rssUrl.trim()}>
        {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Rss className="w-4 h-4 mr-2" />}
        Koble RSS
      </Button>
    </div>
  </div>
);

const SummaryBlock = ({ title, value, children }: { title: string; value: string; children?: ReactNode }) => (
  <div className="rounded-md border border-border bg-card p-4">
    <div className="text-sm font-semibold">{title}</div>
    <p className="text-sm text-muted-foreground mt-2 whitespace-pre-line">
      {value || "Ikke avklart ennå."}
    </p>
    {children}
  </div>
);

const ChatBubble = ({ message }: { message: OnboardingChatMessage }) => {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[88%] rounded-md px-3 py-2 text-sm ${isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
        <div className={`text-[11px] font-medium mb-1 ${isUser ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
          {isUser ? "Du" : "Profilassistent"}
        </div>
        <div className="whitespace-pre-line leading-relaxed">{message.content}</div>
      </div>
    </div>
  );
};

const CvSummary = ({ cv }: { cv: CvDraft }) => {
  const skills = (cv.skills ?? []).flatMap((group: any) => (Array.isArray(group.items) ? group.items : [])).slice(0, 12);
  return (
    <div className="rounded-md border border-border bg-card p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">{cv.full_name || "CV-utkast"}</div>
          <div className="text-sm text-muted-foreground">
            {[cv.headline, cv.location].filter(Boolean).join(" · ") || "CV-en er strukturert."}
          </div>
        </div>
        <Badge variant="secondary">Klar for spørsmål</Badge>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <MiniStat label="Erfaring" value={cv.experiences?.length ?? 0} />
        <MiniStat label="Utdanning" value={cv.education?.length ?? 0} />
        <MiniStat label="Ferdigheter" value={skills.length} />
        <MiniStat label="Prosjekter" value={cv.projects?.length ?? 0} />
      </div>
      {skills.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {skills.map((skill) => (
            <Badge key={skill} variant="outline">
              {skill}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
};

const SetupMatchCard = ({ match }: { match: SetupMatchPreview }) => {
  const job = match.external_jobs;
  const summary = String(match.match_reasoning?.ai_summary ?? match.match_reasoning?.summary ?? "").trim();
  const discovery = match.match_reasoning?.discovery ?? job?.raw_data?.discovery ?? null;
  const provider = job?.provider === "finn" ? "Finn" : "Arbeidsplassen";

  return (
    <div className="rounded-md border border-border bg-card p-3 min-w-0">
      <div className="flex items-start gap-3">
        <ScoreBadge score={match.match_score} className="shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <Badge variant="outline" className="shrink-0">
              {provider}
            </Badge>
            {discovery?.source === "profile_search" && (
              <span className="text-xs text-muted-foreground truncate">
                via {[discovery.query, discovery.location].filter(Boolean).join(" ")}
              </span>
            )}
            {job?.deadline && (
              <span className="text-xs text-muted-foreground truncate">
                Frist {new Date(job.deadline).toLocaleDateString("nb-NO")}
              </span>
            )}
          </div>
          <div className="font-medium text-sm mt-2 leading-snug line-clamp-2">
            {job?.title ?? "Ukjent stilling"}
          </div>
          <div className="text-xs text-muted-foreground mt-1 truncate">
            {[job?.company, job?.location].filter(Boolean).join(" · ") || "Aktiv annonse"}
          </div>
          {summary && <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{summary}</p>}
        </div>
        {job?.source_url && (
          <a
            href={job.source_url}
            target="_blank"
            rel="noreferrer"
            className="h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground shrink-0"
            aria-label="Åpne kilde"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        )}
      </div>
    </div>
  );
};

const MiniStat = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-md bg-muted/60 p-3">
    <div className="text-lg font-semibold tabular-nums">{value}</div>
    <div className="text-xs text-muted-foreground">{label}</div>
  </div>
);

const MiniText = ({ label, value }: { label: string; value?: string | null }) => (
  <div className="rounded-md bg-background/80 p-3 min-w-0">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="text-sm font-medium mt-1 line-clamp-2 whitespace-pre-line">{value || "Ikke fylt ut"}</div>
  </div>
);

const RuleField = ({ title, value, onChange }: { title: string; value: string; onChange: (value: string) => void }) => (
  <div className="space-y-2">
    <Label>{title}</Label>
    <Textarea rows={5} value={value} onChange={(e) => onChange(e.target.value)} />
  </div>
);

const WeightField = ({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) => (
  <div className="space-y-2">
    <Label>{label}</Label>
    <Input type="number" min={0} max={100} value={value} onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)} />
  </div>
);

const SetupIcon = ({ status }: { status: SetupState[string]["status"] }) => {
  if (status === "running") return <Loader2 className="w-4 h-4 animate-spin text-primary" />;
  if (status === "done") return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
  if (status === "error") return <X className="w-4 h-4 text-destructive" />;
  return <div className="w-4 h-4 rounded-full border border-muted-foreground/40" />;
};

export default Onboarding;
