import { cn } from "@/lib/utils";

export const ScoreBadge = ({ score, className }: { score: number | null | undefined; className?: string }) => {
  if (score == null) {
    return <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-muted text-muted-foreground", className)}>—</span>;
  }
  const color =
    score >= 80 ? "bg-score-green/15 text-score-green" :
    score >= 60 ? "bg-score-yellow/15 text-score-yellow" :
    "bg-score-red/15 text-score-red";
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold tabular-nums", color, className)}>
      {score}
    </span>
  );
};
