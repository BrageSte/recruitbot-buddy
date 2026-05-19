import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, useMotionValue, useTransform, AnimatePresence, PanInfo } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScoreBadge } from "@/components/ScoreBadge";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  ChevronUp,
  Heart,
  Loader2,
  RotateCcw,
  Sparkles,
  X as XIcon,
  ExternalLink,
  MapPin,
  Building2,
  CalendarClock,
  AlertTriangle,
  Rss,
  Briefcase,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { isVisiblePipelineJob, todayDateString } from "@/lib/staleJobs";

type Job = any;
type Decision = "uninterested" | "interested" | "very_interested";

const SWIPE_THRESHOLD = 110;
const EXIT_X_DISTANCE = 1200;
const EXIT_Y_DISTANCE = 1000;

const SOURCE_LABEL: Record<string, string> = {
  manual: "Manuell",
  url: "URL",
  rss: "RSS",
  linkedin: "LinkedIn",
  file: "Fil",
  auto_search: "Auto-søk",
  arbeidsplassen: "Arbeidsplassen",
  finn: "Finn",
};

const JobSwipe = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [queue, setQueue] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<{ job: Job; decision: Decision }[]>([]);
  const [includeReviewed, setIncludeReviewed] = useState(false);
  const exitDirRef = useRef<Decision | null>(null);
  const animatingRef = useRef(false);

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-300, 0, 300], [-18, 0, 18]);
  const yesOpacity = useTransform(x, [40, 140], [0, 1]);
  const noOpacity = useTransform(x, [-140, -40], [1, 0]);
  const superOpacity = useTransform(y, [-140, -40], [1, 0]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const today = todayDateString();
    let q = supabase.from("jobs").select("*, external_jobs(status, deadline)").eq("user_id", user.id);
    if (!includeReviewed) {
      q = q.eq("interest_level", "none" as any).eq("status", "discovered" as any);
    } else {
      q = q.in("status", ["discovered", "considering"] as any);
    }
    const { data } = await q.order("match_score", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false });
    setQueue(((data ?? []) as any[]).filter((job) => isVisiblePipelineJob(job, today)));
    setHistory([]);
    setLoading(false);
  }, [includeReviewed, user]);

  useEffect(() => { load(); }, [load]);

  const top = queue[0];
  const next = queue[1];

  const applyDecision = async (job: Job, decision: Decision) => {
    if (animatingRef.current) return;
    animatingRef.current = true;
    exitDirRef.current = decision;

    // Map decision -> status + interest_level
    const update: any = { interest_level: decision };
    if (decision === "uninterested") update.status = "archived";
    else update.status = "considering";

    // Fire DB update in background — don't block UI
    supabase.from("jobs").update(update).eq("id", job.id).then(({ error }) => {
      if (error) toast({ title: "Kunne ikke lagre", description: error.message, variant: "destructive" });
    });

    if (job.external_job_id) {
      supabase.from("job_score_feedback").insert({
        user_id: job.user_id,
        job_id: job.id,
        external_job_id: job.external_job_id,
        decision,
        original_score: job.match_score,
        metadata: { source: "job_swipe" },
      }).then(({ error }) => {
        if (error) console.error("Kunne ikke lagre match-feedback", error.message);
      });

      supabase
        .from("user_job_matches")
        .update({ status: decision === "uninterested" ? "dismissed" : "saved" })
        .eq("user_id", job.user_id)
        .eq("external_job_id", job.external_job_id)
        .then(({ error }) => {
          if (error) console.error("Kunne ikke oppdatere match-status", error.message);
        });
    }

    setHistory((h) => [...h, { job, decision }]);
    setQueue((q) => q.slice(1));
  };

  // Reset motion + lock when next card mounts
  const onCardEnter = () => {
    x.set(0);
    y.set(0);
    exitDirRef.current = null;
    animatingRef.current = false;
  };

  const undo = async () => {
    const last = history[history.length - 1];
    if (!last) return;
    setHistory((h) => h.slice(0, -1));
    setQueue((q) => [last.job, ...q]);
    const { error } = await supabase
      .from("jobs")
      .update({ interest_level: "none" as any, status: "discovered" as any })
      .eq("id", last.job.id);
    if (error) {
      toast({ title: "Kunne ikke angre", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Angret", description: `${last.job.title} satt tilbake til Oppdaget.` });
    }
  };

  const onDragEnd = (_: any, info: PanInfo) => {
    if (!top || animatingRef.current) return;
    const { offset, velocity } = info;
    const swipeUp = offset.y < -SWIPE_THRESHOLD || velocity.y < -800;
    const swipeRight = offset.x > SWIPE_THRESHOLD || velocity.x > 800;
    const swipeLeft = offset.x < -SWIPE_THRESHOLD || velocity.x < -800;

    if (swipeUp) applyDecision(top, "very_interested");
    else if (swipeRight) applyDecision(top, "interested");
    else if (swipeLeft) applyDecision(top, "uninterested");
    else { x.set(0); y.set(0); }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!top) return;
      if (e.key === "ArrowLeft") applyDecision(top, "uninterested");
      else if (e.key === "ArrowRight") applyDecision(top, "interested");
      else if (e.key === "ArrowUp") applyDecision(top, "very_interested");
      else if (e.key === "z" && (e.metaKey || e.ctrlKey)) undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [top, history]);

  const total = useMemo(() => queue.length + history.length, [queue, history]);
  const done = history.length;

  return (
    <div className="min-h-[calc(100vh-3.5rem)] md:min-h-screen flex flex-col bg-gradient-to-b from-background to-muted/30">
      {/* Header */}
      <header className="px-4 md:px-8 py-4 flex items-center justify-between gap-3 border-b border-border/60 bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="sm" onClick={() => navigate("/jobs")} className="shrink-0">
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Tilbake
          </Button>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">Sveip-modus</div>
            <div className="text-[11px] text-muted-foreground">
              {done} / {total} vurdert · {queue.length} igjen
            </div>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={undo} disabled={history.length === 0}>
          <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Angre
        </Button>
      </header>

      {/* Card stage */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 select-none">
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Laster jobber…
          </div>
        ) : !top ? (
          <EmptyState includeReviewed={includeReviewed} setIncludeReviewed={setIncludeReviewed} done={done} />
        ) : (
          <>
            <div className="relative w-full max-w-md aspect-[3/4.4] mb-6">
              {/* Next card peek (behind) */}
              {next && (
                <motion.div
                  key={`peek-${next.id}`}
                  className="absolute inset-0 pointer-events-none"
                  initial={{ scale: 0.94, opacity: 0.5, y: 12 }}
                  animate={{ scale: 0.96, opacity: 0.85, y: 8 }}
                  transition={{ duration: 0.25 }}
                >
                  <JobCardFace job={next} dimmed />
                </motion.div>
              )}

              {/* Top swipeable card */}
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div
                  key={top.id}
                  drag
                  dragElastic={0.7}
                  dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
                  onDragEnd={onDragEnd}
                  style={{ x, y, rotate }}
                  className="absolute inset-0 cursor-grab active:cursor-grabbing"
                  initial={{ scale: 0.96, opacity: 0, y: 20 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  onAnimationStart={() => { /* no-op */ }}
                  onUpdate={() => { /* keep */ }}
                  onAnimationComplete={onCardEnter}
                  exit={{
                    x: exitDirRef.current === "uninterested" ? -EXIT_X_DISTANCE : exitDirRef.current === "interested" ? EXIT_X_DISTANCE : 0,
                    y: exitDirRef.current === "very_interested" ? -EXIT_Y_DISTANCE : 0,
                    rotate: exitDirRef.current === "uninterested" ? -25 : exitDirRef.current === "interested" ? 25 : 0,
                    opacity: 0,
                    transition: { duration: 0.32, ease: [0.22, 0.61, 0.36, 1] },
                  }}
                  transition={{ type: "spring", stiffness: 320, damping: 30 }}
                >
                  {/* Decision overlays */}
                  <motion.div
                    style={{ opacity: yesOpacity }}
                    className="absolute top-6 left-6 z-20 px-3 py-1.5 rounded-md border-2 border-emerald-500 text-emerald-500 font-bold tracking-widest -rotate-12 bg-background/90"
                  >
                    AKTUELL
                  </motion.div>
                  <motion.div
                    style={{ opacity: noOpacity }}
                    className="absolute top-6 right-6 z-20 px-3 py-1.5 rounded-md border-2 border-rose-500 text-rose-500 font-bold tracking-widest rotate-12 bg-background/90"
                  >
                    UINTERESSANT
                  </motion.div>
                  <motion.div
                    style={{ opacity: superOpacity }}
                    className="absolute top-6 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 rounded-md border-2 border-primary text-primary font-bold tracking-widest bg-background/90"
                  >
                    VELDIG INTERESSERT
                  </motion.div>

                  <JobCardFace job={top} />
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-3 md:gap-5">
              <ActionButton
                onClick={() => applyDecision(top, "uninterested")}
                ariaLabel="Nei"
                className="bg-card border-rose-500/40 hover:border-rose-500 text-rose-500 hover:bg-rose-500/10"
              >
                <XIcon className="w-6 h-6" />
              </ActionButton>
              <ActionButton
                onClick={() => applyDecision(top, "very_interested")}
                ariaLabel="Veldig interessert"
                className="bg-card border-primary/40 hover:border-primary text-primary hover:bg-primary/10"
              >
                <ChevronUp className="w-6 h-6" />
              </ActionButton>
              <ActionButton
                onClick={() => applyDecision(top, "interested")}
                ariaLabel="Ja"
                className="bg-card border-emerald-500/40 hover:border-emerald-500 text-emerald-500 hover:bg-emerald-500/10"
              >
                <Heart className="w-6 h-6" />
              </ActionButton>
            </div>
            <div className="mt-4 text-[11px] text-muted-foreground text-center">
              ← Nei · ↑ Veldig interessert · → Ja · Cmd/Ctrl+Z for angre
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const ActionButton = ({
  onClick,
  ariaLabel,
  className,
  children,
}: {
  onClick: () => void;
  ariaLabel: string;
  className?: string;
  children: React.ReactNode;
}) => (
  <button
    onClick={onClick}
    aria-label={ariaLabel}
    className={cn(
      "w-14 h-14 rounded-full border-2 flex items-center justify-center transition-all shadow-card hover:shadow-elevated active:scale-95",
      className
    )}
  >
    {children}
  </button>
);

const ScoreBar = ({ label, value }: { label: string; value: number | null | undefined }) => {
  const v = value ?? 0;
  const tone = v >= 80 ? "bg-score-green" : v >= 60 ? "bg-score-yellow" : v > 0 ? "bg-score-red" : "bg-muted";
  return (
    <div className="flex items-center gap-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground w-14 shrink-0">{label}</div>
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", tone)} style={{ width: `${Math.max(0, Math.min(100, v))}%` }} />
      </div>
      <div className="text-[10px] tabular-nums text-muted-foreground w-7 text-right">{value ?? "—"}</div>
    </div>
  );
};

const JobCardFace = ({ job, dimmed = false }: { job: Job; dimmed?: boolean }) => {
  const hasScores = job.score_professional != null || job.score_culture != null || job.score_practical != null || job.score_enthusiasm != null;
  const sourceLabel = SOURCE_LABEL[job.source] ?? job.source;

  return (
    <Card className={cn("w-full h-full overflow-hidden shadow-elevated bg-card flex flex-col", dimmed && "select-none")}>
      {/* Header band */}
      <div className="bg-gradient-primary px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] uppercase tracking-wider text-primary-foreground/80 inline-flex items-center gap-1">
                {job.source === "rss" ? <Rss className="w-3 h-3" /> : <Briefcase className="w-3 h-3" />}
                {sourceLabel}
              </span>
            </div>
            <h2 className="text-lg md:text-xl font-bold text-primary-foreground leading-tight line-clamp-2">
              {job.title}
            </h2>
            {job.company && (
              <div className="text-sm text-primary-foreground/90 font-medium mt-1 truncate">
                {job.company}
              </div>
            )}
          </div>
          <ScoreBadge score={job.match_score} className="shrink-0 bg-background/95 text-base px-3 py-1.5 font-bold" />
        </div>
      </div>

      <CardContent className="flex-1 flex flex-col gap-3 p-5 overflow-hidden">
        {/* Meta row */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {job.location && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{job.location}</span>
            </div>
          )}
          {job.deadline && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <CalendarClock className="w-3.5 h-3.5 shrink-0" />
              <span>Frist {format(new Date(job.deadline), "dd.MM.yyyy")}</span>
            </div>
          )}
        </div>

        {/* Match breakdown */}
        {hasScores && (
          <div className="rounded-md border border-border/60 bg-muted/30 p-3 space-y-1.5">
            <div className="flex items-center justify-between mb-1">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Match-fordeling</div>
            </div>
            <ScoreBar label="Faglig" value={job.score_professional} />
            <ScoreBar label="Kultur" value={job.score_culture} />
            <ScoreBar label="Praktisk" value={job.score_practical} />
            <ScoreBar label="Lyst" value={job.score_enthusiasm} />
          </div>
        )}

        {/* Summary */}
        {(job.ai_summary || job.description) && (
          <div className="flex-1 min-h-0 overflow-hidden">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 font-semibold">
              {job.ai_summary ? "Hovedoppgave" : "Beskrivelse"}
            </div>
            <p className="text-sm text-foreground leading-relaxed line-clamp-[6]">
              {job.ai_summary || job.description}
            </p>
          </div>
        )}

        {/* Risks */}
        {job.risk_flags?.length > 0 && (
          <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
            <div className="text-xs text-foreground/90 line-clamp-2">
              <span className="font-semibold text-warning">Flagg:</span>{" "}
              {job.risk_flags.slice(0, 3).join(" · ")}
              {job.risk_flags.length > 3 && ` +${job.risk_flags.length - 3}`}
            </div>
          </div>
        )}

        {/* Footer links */}
        <div className="flex items-center justify-between gap-2 pt-2 mt-auto border-t border-border/60">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {job.created_at && `Lagt til ${format(new Date(job.created_at), "dd.MM.yyyy")}`}
          </div>
          <div className="flex items-center gap-3">
            {job.source_url && (
              <a
                href={job.source_url}
                target="_blank"
                rel="noreferrer"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                <ExternalLink className="w-3 h-3" /> Kilde
              </a>
            )}
            <Link
              to={`/jobs/${job.id}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              className="text-xs text-primary hover:underline font-medium"
            >
              Se detaljer →
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const EmptyState = ({
  includeReviewed,
  setIncludeReviewed,
  done,
}: {
  includeReviewed: boolean;
  setIncludeReviewed: (v: boolean) => void;
  done: number;
}) => (
  <div className="text-center max-w-sm space-y-4">
    <div className="w-16 h-16 mx-auto rounded-full bg-gradient-primary flex items-center justify-center shadow-elevated">
      <Sparkles className="w-7 h-7 text-primary-foreground" />
    </div>
    <div>
      <h2 className="text-xl font-semibold">
        {done > 0 ? "Ferdig for nå!" : "Ingen jobber å sveipe"}
      </h2>
      <p className="text-sm text-muted-foreground mt-1">
        {includeReviewed
          ? "Du har vurdert alt som er aktivt i køen."
          : "Alle nye jobber er allerede vurdert."}
      </p>
    </div>
    {!includeReviewed && (
      <Button onClick={() => setIncludeReviewed(true)} variant="outline">
        <RotateCcw className="w-4 h-4 mr-2" />
        Se gjennom jobber på nytt
      </Button>
    )}
    <div>
      <Link to="/jobs" className="text-sm text-primary hover:underline">
        ← Tilbake til jobblisten
      </Link>
    </div>
  </div>
);

export default JobSwipe;
