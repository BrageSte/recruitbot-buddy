import { LucideIcon } from "lucide-react";
import { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}

export const EmptyState = ({ icon: Icon, title, description, action }: EmptyStateProps) => (
  <Card>
    <CardContent className="p-12 text-center">
      <div className="w-14 h-14 rounded-2xl bg-gradient-primary/10 mx-auto flex items-center justify-center mb-4">
        <Icon className="w-7 h-7 text-primary opacity-80" />
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      {description && <p className="text-sm text-muted-foreground mt-1.5 max-w-md mx-auto">{description}</p>}
      {action && <div className="mt-5 inline-flex">{action}</div>}
    </CardContent>
  </Card>
);
