import { Suspense, lazy } from "react";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { RouteFallback } from "@/components/RouteFallback";

const Landing = lazy(() => import("@/pages/Landing"));

export const RootRoute = () => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) {
    return (
      <Suspense fallback={<RouteFallback fullscreen />}>
        <Landing />
      </Suspense>
    );
  }
  return <AppLayout />;
};
