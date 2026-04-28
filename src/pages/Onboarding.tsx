import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
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
  Check,
  CheckCircle2,
  FileText,
  Loader2,
  LogOut,
  MessageSquare,
  Plus,
  Send,
  Sparkles,
  Target,
  Trash2,
  Upload,
  Wand2,
  X,
} from "lucide-react";

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

const steps: { key: StepKey; label: string }[] = [
  { key: "cv", label: "CV" },
  { key: "questions", label: "Spørsmål" },
  { key: "review", label: "Profilutkast" },
  { key: "chat", label: "Kartlegging" },
  { key: "setup", label: "Jobbsøk" },
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
  cv: "Lagrer CV",
  profile: "Lagrer profil",
  sources: "Lager Finn-forslag",
  arbeidsplassen: "Henter Arbeidsplassen",
  matching: "Matcher jobber",
};

const emptySetupState: SetupState = {
  cv: { status: "pending" },
  profile: { status: "pending" },
  sources: { status: "pending" },
  arbeidsplassen: { status: "pending" },
  matching: { status: "pending" },
};

const freshSetupState = (): SetupState => ({
  cv: { status: "pending" },
  profile: { status: "pending" },
  sources: { status: "pending" },
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
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [generatingQuestions, setGeneratingQuestions] = useState(false);
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [chatMessages, setChatMessages] = useState<OnboardingChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [refiningDraft, setRefiningDraft] = useState(false);
  const [newSignalLabel, setNewSignalLabel] = useState("");
  const [newSignalCategory, setNewSignalCategory] = useState<SignalDraft["category"]>("skill");
  const [saving, setSaving] = useState(false);
  const [setupState, setSetupState] = useState<SetupState>(freshSetupState);
  const [setupDone, setSetupDone] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const currentStepIndex = steps.findIndex((step) => step.key === currentStep);
  const progress = Math.round(((currentStepIndex + 1) / steps.length) * 100);

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
      setRunId(runRes.data.id);
      setCurrentStep(runRes.data.current_step ?? "cv");
      setCvDraft(Object.keys(runRes.data.cv_draft ?? {}).length ? normalizeCv(runRes.data.cv_draft) : existingCv);
      setQuestions(payload.questions);
      setAnswers(payload.answers);
      setDraft(Object.keys(runRes.data.profile_draft ?? {}).length ? runRes.data.profile_draft : null);
      setChatMessages(normalizeChatMessages(runRes.data.chat_messages));
      setLoading(false);
      return;
    }

    setCvDraft(existingCv);
    setChatMessages([]);
    const { data, error } = await (supabase as any)
      .from("profile_onboarding_runs")
      .insert({
        user_id: user.id,
        current_step: "cv",
        status: "draft",
        cv_draft: existingCv ?? {},
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

  const generateQuestions = async () => {
    setGeneratingQuestions(true);
    try {
      const { data, error } = await supabase.functions.invoke("profile-onboarding-ai", {
        body: { action: "generate_questions", cv: cvDraft, profile },
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

  const requiredMissing = useMemo(
    () => questions.some((q) => q.required && !answers[q.id]?.trim()),
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

  const startRecruiterChat = async () => {
    if (!draft) return;
    const nextMessages = chatMessages.length
      ? chatMessages
      : [
          createChatMessage(
            "assistant",
            "Jeg har laget en første kartlegging. Skriv hva som ikke stemmer, hva du vil legge til, eller hvilke jobber du egentlig vil mot. Så oppdaterer jeg profilen før vi setter opp matchene.",
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
      if (!nextDraft || !reply) throw new Error("AI svarte uten oppdatert kartlegging");

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
    setSetupState((prev) => ({ ...prev, [key]: { status, detail } }));
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
    const { error: profileError } = await (supabase as any).from("profiles").upsert(
      {
        user_id: user.id,
        email: user.email,
        display_name: profile?.display_name ?? cvDraft?.full_name ?? user.email?.split("@")[0] ?? null,
        linkedin_url: profile?.linkedin_url ?? cvDraft?.linkedin_url ?? null,
        master_profile: draft.master_profile,
        style_guide: draft.style_guide,
        weight_professional: draft.weights.professional,
        weight_culture: draft.weights.culture,
        weight_practical: draft.weights.practical,
        weight_enthusiasm: draft.weights.enthusiasm,
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
    setSetupState(freshSetupState());
    setSetupDone(false);
    await updateStep("setup", "applying");

    try {
      if (cvDraft) await saveCvDraft();
      else setSetupItem("cv", "done", "Hoppet over CV");

      await saveProfileDraft();

      setSetupItem("sources", "running");
      try {
        await supabase.functions.invoke("suggest-source-feeds", { body: { force: true } });
        setSetupItem("sources", "done");
      } catch (e: any) {
        setSetupItem("sources", "error", e.message);
      }

      setSetupItem("arbeidsplassen", "running");
      try {
        await supabase.functions.invoke("ingest-arbeidsplassen-feed", { body: { maxPages: 5, sinceDays: 30 } });
        setSetupItem("arbeidsplassen", "done");
      } catch (e: any) {
        setSetupItem("arbeidsplassen", "error", e.message);
      }

      setSetupItem("matching", "running");
      try {
        const { data, error } = await supabase.functions.invoke("match-user-jobs", { body: { limit: 20 } });
        if (error) throw error;
        setSetupItem("matching", "done", `${(data as any)?.scored ?? 0} jobber scoret`);
      } catch (e: any) {
        setSetupItem("matching", "error", e.message);
      }

      setSetupDone(true);
      toast({ title: "Interesseprofilen er klar" });
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
    navigate("/auth", { replace: true });
  };

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
              <div className="text-sm font-semibold">Bygg interesseprofil</div>
              <div className="text-xs text-muted-foreground truncate">
                {rerun ? "Kjør onboarding på nytt" : "Første oppsett for bedre matcher"}
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
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Profil som faktisk matcher deg</h1>
              <p className="text-sm text-muted-foreground mt-2">
                Last opp CV, svar kort, og godkjenn AI-forslaget før appen bruker det.
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
                  Start med CV
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  CV-en gir faktagrunnlaget. Du kan også fortsette uten CV og fylle retningen manuelt.
                </p>
              </CardHeader>
              <CardContent className="space-y-6">
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
                    <Loader2 className="w-4 h-4 animate-spin" /> AI strukturerer CV-en...
                  </div>
                )}

                {cvDraft && <CvSummary cv={cvDraft} />}

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
                      Fortsett
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
                  Spørsmål om retning
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Svar kort og konkret. AI bruker svarene til å foreslå profiltekst og tags.
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
                  questions.map((question) => (
                    <div key={question.id} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Label className="text-sm">{question.title}</Label>
                        {question.required && <Badge variant="secondary">Viktig</Badge>}
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
                  ))
                )}

                <div className="flex items-center justify-between gap-3 flex-wrap pt-2">
                  <Button variant="ghost" onClick={() => updateStep("cv", "draft")}>
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Tilbake
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={generateQuestions} disabled={generatingQuestions}>
                      Oppdater spørsmål
                    </Button>
                    <Button onClick={generateDraft} disabled={generatingDraft || questions.length === 0 || requiredMissing}>
                      {generatingDraft ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                      Lag profilutkast
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
                  Godkjenn profilutkast
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Dette er bare et forslag. Rediger alt som ikke føles riktig før appen bruker det.
                </p>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>Interesseprofil</Label>
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

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <WeightField label="Fag" value={draft.weights.professional} onChange={(value) => updateDraftWeight("professional", value)} />
                  <WeightField label="Kultur" value={draft.weights.culture} onChange={(value) => updateDraftWeight("culture", value)} />
                  <WeightField label="Praktisk" value={draft.weights.practical} onChange={(value) => updateDraftWeight("practical", value)} />
                  <WeightField label="Entusiasme" value={draft.weights.enthusiasm} onChange={(value) => updateDraftWeight("enthusiasm", value)} />
                </div>

                <div className="flex items-center justify-between gap-3 flex-wrap pt-2">
                  <Button variant="ghost" onClick={() => updateStep("questions", "questions")}>
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Tilbake
                  </Button>
                  <Button onClick={startRecruiterChat}>
                    <MessageSquare className="w-4 h-4 mr-2" />
                    Fortsett til kartlegging
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {currentStep === "chat" && draft && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-primary" />
                  Recruiter-kartlegging
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Sjekk oppsummeringen og bruk chatten til å korrigere retning, rammer og hva du faktisk vil søke etter.
                </p>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-5 items-start">
                  <RecruiterSummary draft={draft} />

                  <div className="rounded-md border border-border bg-background min-h-[520px] xl:h-[640px] xl:max-h-[calc(100vh-220px)] flex flex-col overflow-hidden">
                    <div className="border-b border-border p-4">
                      <div className="text-sm font-semibold">Samtale</div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Skriv som du ville svart i et kort møte med en recruiter.
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
                    Godkjenn og sett opp jobbsøk
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
                  Setter opp jobbsøket
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Profilen lagres først. Kilder og matching kan feile uten at profilutkastet går tapt.
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

                {setupDone && (
                  <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-4">
                    <div className="font-medium text-sm">Klar til å se matcher</div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Interesseprofilen er lagret, kildeforslag er forsøkt opprettet, og første matchrunde er kjørt.
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 flex-wrap">
                  <Button variant="outline" asChild>
                    <Link to="/">Dashboard</Link>
                  </Button>
                  <Button asChild disabled={!setupDone}>
                    <Link to="/matches">
                      Se matcher <ArrowRight className="w-4 h-4 ml-2" />
                    </Link>
                  </Button>
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

const RecruiterSummary = ({ draft }: { draft: ProfileDraft }) => {
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
          <div className="text-sm font-semibold">Hvordan AI bør matche deg</div>
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
          {isUser ? "Du" : "Recruiter"}
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
            {[cv.headline, cv.location].filter(Boolean).join(" · ") || "AI har strukturert CV-en."}
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

const MiniStat = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-md bg-muted/60 p-3">
    <div className="text-lg font-semibold tabular-nums">{value}</div>
    <div className="text-xs text-muted-foreground">{label}</div>
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
