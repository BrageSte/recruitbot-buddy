import {
  addDays,
  differenceInCalendarDays,
  endOfWeek,
  format,
  isAfter,
  isBefore,
  isSameDay,
  isWithinInterval,
  parseISO,
  startOfWeek,
} from "date-fns";

export type CoachJob = {
  id: string;
  title: string;
  company?: string | null;
  match_score?: number | null;
  status?: string | null;
  deadline?: string | null;
  created_at?: string | null;
};

export type CoachApplication = {
  id: string;
  job_id: string;
  status?: string | null;
  sent_at?: string | null;
  generated_text?: string | null;
  created_at?: string | null;
  jobs?: {
    title?: string | null;
    company?: string | null;
    deadline?: string | null;
    match_score?: number | null;
  } | null;
};

export type CoachEvent = {
  id: string;
  kind: "interview" | "follow_up" | "note" | "custom" | string;
  title: string;
  description?: string | null;
  event_date: string;
  event_time?: string | null;
  location?: string | null;
  application_id?: string | null;
  job_id?: string | null;
};

export type CoachGoal = {
  id: string;
  kind: "target_date" | "weekly_apps" | "milestone" | "custom" | string;
  title: string;
  description?: string | null;
  target_date?: string | null;
  target_count?: number | null;
  progress_count?: number | null;
  status?: string | null;
};

export type CoachProfile = {
  display_name?: string | null;
  master_profile?: string | null;
  weekly_goal?: number | null;
} | null;

export type CoachSourceHealth = {
  hasActiveSources?: boolean;
  hasErrors?: boolean;
  activeCount?: number;
  totalFound?: number;
};

export type CoachContext = {
  jobs: CoachJob[];
  applications: CoachApplication[];
  events: CoachEvent[];
  goals: CoachGoal[];
  profile?: CoachProfile;
  hasCv?: boolean;
  sourceHealth?: CoachSourceHealth;
  now?: Date;
};

export type DailyCoachActionKind =
  | "interview"
  | "deadline"
  | "follow_up"
  | "high_match"
  | "draft_review"
  | "job_queue"
  | "source_health"
  | "setup_cv"
  | "setup_profile"
  | "setup_goal"
  | "steady";

export type DailyCoachAction = {
  id: string;
  priority: number;
  kind: DailyCoachActionKind;
  title: string;
  description: string;
  ctaLabel: string;
  href: string;
  dueDate?: string;
  completedBy: string;
  metadata?: Record<string, unknown>;
};

export type DailyCoachResult = {
  statusText: string;
  primaryAction: DailyCoachAction;
  secondaryActions: DailyCoachAction[];
  actions: DailyCoachAction[];
};

export type CalendarCoachSuggestion = {
  id: string;
  title: string;
  description: string;
  date: string;
  kind: "interview" | "follow_up" | "note" | "custom";
  eventPayload: {
    title: string;
    kind: "interview" | "follow_up" | "note" | "custom";
    event_date: string;
    event_time?: string | null;
    location?: string | null;
    description?: string | null;
    application_id?: string | null;
    job_id?: string | null;
  };
};

const CLOSED_JOB_STATUSES = new Set(["archived", "rejected"]);
const ACTIVE_APPLICATION_STATUSES = new Set(["draft", "sent", "response_received", "interview"]);

const dateKey = (date: Date) => format(date, "yyyy-MM-dd");

const safeDate = (value?: string | null) => {
  if (!value) return null;
  const parsed = parseISO(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const isActiveJob = (job: CoachJob) => !CLOSED_JOB_STATUSES.has(job.status ?? "");

const companySuffix = (company?: string | null) => (company ? ` hos ${company}` : "");

const dueText = (date: Date, now: Date) => {
  const days = differenceInCalendarDays(date, now);
  if (days === 0) return "i dag";
  if (days === 1) return "i morgen";
  if (days > 1) return `om ${days} dager`;
  return "har passert";
};

const hasUsefulProfile = (profile?: CoachProfile) =>
  Boolean(profile?.master_profile?.trim() || profile?.display_name?.trim());

const hasFutureFollowUpEvent = (events: CoachEvent[], applicationId: string, now: Date) =>
  events.some((event) => {
    const eventDate = safeDate(event.event_date);
    return (
      event.kind === "follow_up" &&
      event.application_id === applicationId &&
      eventDate &&
      !isBefore(eventDate, now)
    );
  });

const hasPrepEventForInterview = (events: CoachEvent[], interview: CoachEvent) =>
  events.some((event) => {
    if (event.id === interview.id) return false;
    const sameApplication = interview.application_id && event.application_id === interview.application_id;
    const titleMatch = event.title.toLowerCase().includes("forbered intervju");
    return (sameApplication || titleMatch) && event.kind !== "interview";
  });

const sortActions = (actions: DailyCoachAction[]) =>
  [...actions].sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title, "nb"));

const actionStatusText = (action: DailyCoachAction) => {
  switch (action.kind) {
    case "interview":
      return "I dag bør du fokusere på intervjuet som kommer først.";
    case "deadline":
      return "I dag bør du sikre en søknad før fristen løper fra deg.";
    case "follow_up":
      return "I dag bør du hente frem en sendt søknad og følge opp ryddig.";
    case "high_match":
      return "I dag bør du gjøre én god toppmatch om til neste steg.";
    case "draft_review":
      return "I dag bør du få et utkast fra kladd til ferdig vurdert.";
    case "job_queue":
      return "I dag bør du rydde i jobbkøen og velge hva som er verdt tid.";
    case "source_health":
      return "I dag bør du sørge for at kildene faktisk finner relevante jobber.";
    case "setup_cv":
      return "I dag bør du få CV-grunnlaget på plass først.";
    case "setup_profile":
      return "I dag bør du spisse profilen, så matchene blir mer nyttige.";
    case "setup_goal":
      return "I dag bør du gi jobbsøkingen en konkret plan.";
    default:
      return "I dag er det rom for en rolig, fokusert jobbsøkt.";
  }
};

export const buildDailyCoach = (context: CoachContext): DailyCoachResult => {
  const now = context.now ?? new Date();
  const today = safeDate(dateKey(now)) ?? now;
  const tomorrow = addDays(today, 1);
  const jobs = context.jobs.filter(isActiveJob);
  const applications = context.applications.filter((app) => ACTIVE_APPLICATION_STATUSES.has(app.status ?? "draft"));
  const draftedJobIds = new Set(context.applications.map((app) => app.job_id));
  const actions: DailyCoachAction[] = [];

  if (context.hasCv === false) {
    actions.push({
      id: "setup-cv",
      priority: 12,
      kind: "setup_cv",
      title: "Fullfør CV-grunnlaget",
      description: "Coachen trenger en CV å bygge ærlige søknader og vurderinger fra.",
      ctaLabel: "Åpne CV",
      href: "/cv",
      completedBy: "Når en CV-mal finnes",
    });
  }

  context.events.forEach((event) => {
    if (event.kind !== "interview") return;
    const eventDate = safeDate(event.event_date);
    if (!eventDate || (!isSameDay(eventDate, today) && !isSameDay(eventDate, tomorrow))) return;
    const isToday = isSameDay(eventDate, today);
    actions.push({
      id: `interview-${event.id}`,
      priority: isToday ? 5 : 10,
      kind: "interview",
      title: `${isToday ? "Intervju i dag" : "Forbered intervju i morgen"}: ${event.title}`,
      description: [
        event.event_time ? `Kl. ${event.event_time.slice(0, 5)}` : null,
        event.location,
        "Gå gjennom motivasjon, konkrete eksempler og spørsmål til arbeidsgiver.",
      ].filter(Boolean).join(" · "),
      ctaLabel: event.application_id ? "Åpne søknad" : "Åpne kalender",
      href: event.application_id ? `/applications/${event.application_id}` : "/calendar",
      dueDate: event.event_date,
      completedBy: "Når intervjuet er gjennomført eller flyttet",
      metadata: { eventId: event.id, applicationId: event.application_id },
    });
  });

  jobs.forEach((job) => {
    if (draftedJobIds.has(job.id)) return;
    const deadline = safeDate(job.deadline);
    if (!deadline) return;
    const days = differenceInCalendarDays(deadline, today);
    if (days < 0 || days > 3) return;
    actions.push({
      id: `deadline-${job.id}`,
      priority: days === 0 ? 18 : 20 + days,
      kind: "deadline",
      title: `Sjekk fristen: ${job.title}`,
      description: `Fristen er ${dueText(deadline, today)}${job.match_score != null ? ` · match ${job.match_score}` : ""}.`,
      ctaLabel: "Åpne jobb",
      href: `/jobs/${job.id}`,
      dueDate: job.deadline ?? undefined,
      completedBy: "Når søknadsutkast er opprettet, jobben er søkt på eller arkivert",
      metadata: { jobId: job.id, score: job.match_score },
    });
  });

  applications.forEach((application) => {
    if (!application.sent_at || application.status !== "sent") return;
    const sentAt = safeDate(application.sent_at);
    if (!sentAt) return;
    const daysSinceSent = differenceInCalendarDays(today, sentAt);
    if (daysSinceSent < 10 || hasFutureFollowUpEvent(context.events, application.id, today)) return;
    actions.push({
      id: `follow-up-${application.id}`,
      priority: 30 + Math.min(daysSinceSent, 20) / 100,
      kind: "follow_up",
      title: `Følg opp ${application.jobs?.title ?? "søknaden"}`,
      description: `Sendt for ${daysSinceSent} dager siden${companySuffix(application.jobs?.company)}. En kort, høflig oppfølging holder saken varm.`,
      ctaLabel: "Åpne søknad",
      href: `/applications/${application.id}`,
      dueDate: dateKey(today),
      completedBy: "Når oppfølging er lagt i kalenderen eller søknaden har fått ny status",
      metadata: { applicationId: application.id, daysSinceSent },
    });
  });

  jobs
    .filter((job) => !draftedJobIds.has(job.id) && (job.match_score ?? 0) >= 80)
    .sort((a, b) => (b.match_score ?? 0) - (a.match_score ?? 0))
    .slice(0, 4)
    .forEach((job, index) => {
      actions.push({
        id: `high-match-${job.id}`,
        priority: 40 + index / 100,
        kind: "high_match",
        title: `Vurder toppmatch: ${job.title}`,
        description: `${job.match_score ?? "Høy"} i match${companySuffix(job.company)}. Bruk noen minutter på å avgjøre om denne skal bli søknad.`,
        ctaLabel: "Åpne jobb",
        href: `/jobs/${job.id}`,
        dueDate: job.deadline ?? undefined,
        completedBy: "Når jobb er lagret som søknad, avvist eller arkivert",
        metadata: { jobId: job.id, score: job.match_score },
      });
    });

  applications
    .filter((application) => application.status === "draft" || (application.generated_text && !application.sent_at))
    .slice(0, 4)
    .forEach((application, index) => {
      actions.push({
        id: `draft-${application.id}`,
        priority: 50 + index / 100,
        kind: "draft_review",
        title: `Gå gjennom utkastet til ${application.jobs?.title ?? "søknaden"}`,
        description: "Les gjennom, juster tonen og marker den som sendt når du faktisk har sendt den.",
        ctaLabel: "Åpne utkast",
        href: `/applications/${application.id}`,
        completedBy: "Når søknaden markeres som sendt, trekkes tilbake eller slettes",
        metadata: { applicationId: application.id },
      });
    });

  const triageCount = jobs.filter((job) => !draftedJobIds.has(job.id) && ["discovered", "considering"].includes(job.status ?? "discovered")).length;
  if (triageCount > 0) {
    actions.push({
      id: "job-queue",
      priority: 60,
      kind: "job_queue",
      title: `Rydd i ${triageCount} ${triageCount === 1 ? "jobb" : "jobber"} som venter`,
      description: "Sveip eller sorter køen, så de beste mulighetene får oppmerksomhet først.",
      ctaLabel: "Sveip jobber",
      href: "/jobs/swipe",
      completedBy: "Når køen er vurdert eller jobbene har fått ny status",
      metadata: { count: triageCount },
    });
  }

  if (context.sourceHealth?.hasErrors) {
    actions.push({
      id: "source-health",
      priority: 70,
      kind: "source_health",
      title: "Sjekk kildene som feiler",
      description: "En kilde med feil betyr at relevante jobber kan utebli. Ta en rask sjekk før du leter manuelt.",
      ctaLabel: "Åpne kilder",
      href: "/sources",
      completedBy: "Når kilden er rettet, pauset eller erstattet",
      metadata: context.sourceHealth,
    });
  }

  if (jobs.length === 0 || context.sourceHealth?.hasActiveSources === false) {
    actions.push({
      id: "sources-empty",
      priority: 75,
      kind: "source_health",
      title: "Få nye jobber inn i systemet",
      description: "Legg til eller kjør kilder, så dashboardet kan jobbe med reelle muligheter.",
      ctaLabel: "Sett opp kilder",
      href: "/sources",
      completedBy: "Når minst én aktiv kilde eller jobb finnes",
      metadata: { activeJobs: jobs.length },
    });
  }

  if (!hasUsefulProfile(context.profile)) {
    actions.push({
      id: "setup-profile",
      priority: 80,
      kind: "setup_profile",
      title: "Spiss matchprofilen",
      description: "En tydelig retning gir bedre matcher og mindre støy i jobbkøen.",
      ctaLabel: "Åpne profil",
      href: "/profile",
      completedBy: "Når masterprofilen beskriver retning, styrker og rammer",
    });
  }

  if (!context.goals.some((goal) => goal.kind === "target_date" && goal.status === "active")) {
    actions.push({
      id: "setup-goal",
      priority: 85,
      kind: "setup_goal",
      title: "Sett en jobbsøk-plan",
      description: "Et hovedmål og ukerytme gjør det lettere å vite hva som er nok denne uken.",
      ctaLabel: "Lag plan",
      href: "/calendar",
      completedBy: "Når et aktivt hovedmål finnes",
    });
  }

  if (actions.length === 0) {
    actions.push({
      id: "steady-session",
      priority: 100,
      kind: "steady",
      title: "Ta en kort jobbsøkt",
      description: "Alt brenner ikke i dag. Bruk 20 minutter på å se nye matcher eller forbedre én eksisterende søknad.",
      ctaLabel: "Åpne jobber",
      href: "/jobs",
      completedBy: "Når du har vurdert eller forbedret én ting",
    });
  }

  const sorted = sortActions(actions);
  const primaryAction = sorted[0];
  return {
    statusText: actionStatusText(primaryAction),
    primaryAction,
    secondaryActions: sorted.slice(1, 5),
    actions: sorted,
  };
};

export const buildCalendarCoachSuggestions = (context: CoachContext): CalendarCoachSuggestion[] => {
  const now = context.now ?? new Date();
  const today = safeDate(dateKey(now)) ?? now;
  const jobs = context.jobs.filter(isActiveJob);
  const draftedJobIds = new Set(context.applications.map((app) => app.job_id));
  const suggestions: CalendarCoachSuggestion[] = [];

  context.applications.forEach((application) => {
    if (!application.sent_at || application.status !== "sent") return;
    const sentAt = safeDate(application.sent_at);
    if (!sentAt) return;
    const followUpDate = addDays(sentAt, 12);
    if (differenceInCalendarDays(today, sentAt) < 10) return;
    if (hasFutureFollowUpEvent(context.events, application.id, today)) return;
    const date = isBefore(followUpDate, today) ? today : followUpDate;
    suggestions.push({
      id: `suggest-follow-up-${application.id}`,
      title: `Følg opp ${application.jobs?.title ?? "søknaden"}`,
      description: `Søknaden ble sendt for ${differenceInCalendarDays(today, sentAt)} dager siden. Legg inn en konkret oppfølging.`,
      date: dateKey(date),
      kind: "follow_up",
      eventPayload: {
        title: `Følg opp: ${application.jobs?.title ?? "Søknad"}`,
        kind: "follow_up",
        event_date: dateKey(date),
        description: "Send en kort og høflig oppfølging på søknaden.",
        application_id: application.id,
      },
    });
  });

  context.events.forEach((event) => {
    if (event.kind !== "interview") return;
    const interviewDate = safeDate(event.event_date);
    if (!interviewDate || isBefore(interviewDate, today) || hasPrepEventForInterview(context.events, event)) return;
    const prepDate = isSameDay(interviewDate, today) ? today : addDays(interviewDate, -1);
    suggestions.push({
      id: `suggest-interview-prep-${event.id}`,
      title: `Forbered intervju: ${event.title}`,
      description: "Sett av tid til motivasjon, eksempler og spørsmål før intervjuet.",
      date: dateKey(prepDate),
      kind: "note",
      eventPayload: {
        title: `Forbered intervju: ${event.title}`,
        kind: "note",
        event_date: dateKey(prepDate),
        description: "Gå gjennom CV, motivasjon, STAR-eksempler og spørsmål til arbeidsgiver.",
        application_id: event.application_id ?? null,
        job_id: event.job_id ?? null,
      },
    });
  });

  jobs
    .filter((job) => !draftedJobIds.has(job.id) && (job.match_score ?? 0) >= 80 && Boolean(job.deadline))
    .sort((a, b) => (b.match_score ?? 0) - (a.match_score ?? 0))
    .slice(0, 3)
    .forEach((job) => {
      const deadline = safeDate(job.deadline);
      if (!deadline || isBefore(deadline, today)) return;
      const plannedDate = isSameDay(deadline, today) ? today : addDays(deadline, -1);
      suggestions.push({
        id: `suggest-apply-${job.id}`,
        title: `Søk på toppmatch: ${job.title}`,
        description: `${job.match_score ?? "Høy"} i match${companySuffix(job.company)}. Planlegg søknaden før fristen.`,
        date: dateKey(plannedDate),
        kind: "note",
        eventPayload: {
          title: `Søk på: ${job.title}`,
          kind: "note",
          event_date: dateKey(plannedDate),
          description: "Vurder jobben, lag utkast og sjekk fristen.",
          job_id: job.id,
        },
      });
    });

  const activeGoal = context.goals.find((goal) => goal.kind === "target_date" && goal.status === "active");
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
  const hasThisWeekEvent = context.events.some((event) => {
    const eventDate = safeDate(event.event_date);
    return eventDate && isWithinInterval(eventDate, { start: weekStart, end: weekEnd });
  });
  if (activeGoal && !hasThisWeekEvent) {
    suggestions.push({
      id: "suggest-weekly-session",
      title: "Legg inn ukentlig jobbsøk-økt",
      description: "Planen blir mer nyttig når kalenderen har en fast arbeidsøkt denne uken.",
      date: dateKey(isAfter(today, weekEnd) ? addDays(today, 1) : today),
      kind: "custom",
      eventPayload: {
        title: "Ukentlig jobbsøk-økt",
        kind: "custom",
        event_date: dateKey(isAfter(today, weekEnd) ? addDays(today, 1) : today),
        description: "Gå gjennom matcher, søknader, frister og oppfølginger.",
      },
    });
  }

  const uniqueById = new Map(suggestions.map((suggestion) => [suggestion.id, suggestion]));
  return [...uniqueById.values()].sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, "nb"));
};
