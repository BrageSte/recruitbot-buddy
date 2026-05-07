import { Loader2 } from "lucide-react";

type RouteFallbackProps = {
  fullscreen?: boolean;
  label?: string;
};

export const RouteFallback = ({
  fullscreen = false,
  label = "Laster side...",
}: RouteFallbackProps) => {
  if (fullscreen) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-subtle">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{label}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[40vh] items-center justify-center p-8">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>{label}</span>
      </div>
    </div>
  );
};
