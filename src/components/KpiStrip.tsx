import { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface KpiItem {
  label: string;
  value: number | string;
  icon: LucideIcon;
  tone?: "default" | "primary" | "success" | "warning" | "danger";
  hint?: string;
}

const TONE_CLS: Record<NonNullable<KpiItem["tone"]>, string> = {
  default: "bg-muted text-muted-foreground",
  primary: "bg-primary/10 text-primary",
  success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  danger: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
};

export const KpiStrip = ({ items, className }: { items: KpiItem[]; className?: string }) => (
  <div className={cn("grid grid-cols-2 md:grid-cols-4 gap-3", className)}>
    {items.map((kpi, i) => {
      const Icon = kpi.icon;
      const tone = TONE_CLS[kpi.tone ?? "default"];
      return (
        <Card key={i} className="hover:shadow-elevated transition-shadow">
          <CardContent className="p-4 flex items-start gap-3">
            <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", tone)}>
              <Icon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-2xl font-semibold tabular-nums leading-none">{kpi.value}</div>
              <div className="text-xs text-muted-foreground mt-1.5 truncate">{kpi.label}</div>
              {kpi.hint && <div className="text-[11px] text-muted-foreground/70 mt-0.5 truncate">{kpi.hint}</div>}
            </div>
          </CardContent>
        </Card>
      );
    })}
  </div>
);
