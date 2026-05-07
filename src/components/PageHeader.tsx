import { LucideIcon } from "lucide-react";
import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}

export const PageHeader = ({ icon: Icon, title, description, actions, className }: PageHeaderProps) => (
  <header className={cn("flex items-start justify-between gap-4 flex-wrap", className)}>
    <div className="flex items-start gap-3 min-w-0">
      <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center shadow-elevated shrink-0">
        <Icon className="w-5 h-5 text-primary-foreground" />
      </div>
      <div className="min-w-0">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight truncate">{title}</h1>
        {description && <p className="text-muted-foreground text-sm mt-1">{description}</p>}
      </div>
    </div>
    {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
  </header>
);
