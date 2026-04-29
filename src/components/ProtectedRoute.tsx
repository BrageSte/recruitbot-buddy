import { Navigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [checkingOnboarding, setCheckingOnboarding] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const checkOnboarding = async () => {
      if (!user) {
        setNeedsOnboarding(false);
        setCheckingOnboarding(false);
        return;
      }
      if (location.pathname === "/onboarding") {
        setNeedsOnboarding(false);
        setCheckingOnboarding(false);
        return;
      }

      setCheckingOnboarding(true);
      const { data, error } = await (supabase as any)
        .from("profiles")
        .select("onboarding_completed_at,onboarding_skipped_at")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!cancelled) {
        setNeedsOnboarding(!error && !data?.onboarding_completed_at && !data?.onboarding_skipped_at);
        setCheckingOnboarding(false);
      }
    };

    checkOnboarding();
    return () => {
      cancelled = true;
    };
  }, [user, location.pathname]);

  if (loading || checkingOnboarding) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-subtle">
        <div className="text-muted-foreground text-sm">Laster…</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/start" replace state={{ from: location }} />;
  if (needsOnboarding) return <Navigate to="/onboarding" replace state={{ from: location }} />;

  return <>{children}</>;
};
