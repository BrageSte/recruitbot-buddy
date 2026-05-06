import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Briefcase,
  Calendar as CalendarIcon,
  Clock,
  FileText,
  Layers,
  Radar,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { DailyCoachAction, DailyCoachResult } from "@/lib/dailyCoach";

const COACH_ICON: Record<DailyCoachAction["kind"], any> = {
  interview: Users,
  deadline: AlertTriangle,
  follow_up: Clock,
  high_match: Sparkles,
  draft_review: FileText,
  job_queue: Layers,
  source_health: Radar,
  setup_cv: FileText,
  setup_profile: Target,
  setup_goal: CalendarIcon,
  steady: Briefcase,
};

const COACH_TONE: Record<DailyCoachAction["kind"], string> = {
  interview: "border-l-purple-500",
  deadline: "border-l-orange-500",
  follow_up: "border-l-amber-500",
  high_match: "border-l-primary",
  draft_review: "border-l-blue-500",
  job_queue: "border-l-primary",
  source_health: "border-l-rose-500",
  setup_cv: "border-l-emerald-500",
  setup_profile: "border-l-emerald-500",
  setup_goal: "border-l-emerald-500",
  steady: "border-l-muted-foreground",
};

export const DailyCoachPanel = ({ coach }: { coach: DailyCoachResult }) => {
  const PrimaryIcon = COACH_ICON[coach.primaryAction.kind];
  return (
    <Card className="overflow-hidden border-primary/20 shadow-card">
      <CardContent className="p-4 md:p-5">
        <div className="grid gap-4 lg:grid-cols-[1.25fr,1fr]">
          <div className={cn("rounded-md border-l-4 bg-accent/35 p-4", COACH_TONE[coach.primaryAction.kind])}>
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-md bg-card border flex items-center justify-center shrink-0">
                <PrimaryIcon className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Bot className="w-3.5 h-3.5" />
                  Dagens coach
                </div>
                <h2 className="text-lg md:text-xl font-semibold mt-1">{coach.primaryAction.title}</h2>
                <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{coach.primaryAction.description}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  Ferdig når: {coach.primaryAction.completedBy.toLowerCase()}
                </p>
                <Button asChild className="mt-4 gap-1.5">
                  <Link to={coach.primaryAction.href}>
                    {coach.primaryAction.ctaLabel}
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Neste steg</h3>
              <span className="text-[11px] text-muted-foreground">{coach.actions.length} forslag</span>
            </div>
            {coach.secondaryActions.length === 0 ? (
              <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                Ingen ekstra steg akkurat nå. Fullfør hovedhandlingen, så oppdateres coachen.
              </div>
            ) : (
              <div className="space-y-1">
                {coach.secondaryActions.map((action) => {
                  const Icon = COACH_ICON[action.kind];
                  return (
                    <Link
                      key={action.id}
                      to={action.href}
                      className="group flex items-start gap-3 rounded-md border border-transparent px-2 py-2 hover:border-border hover:bg-accent/40 transition-colors"
                    >
                      <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center shrink-0">
                        <Icon className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{action.title}</div>
                        <div className="text-xs text-muted-foreground truncate">{action.ctaLabel}</div>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-muted-foreground mt-1 shrink-0 group-hover:translate-x-0.5 transition-transform" />
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
