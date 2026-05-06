import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import Landing from "@/pages/Landing";

export const RootRoute = () => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Landing />;
  return <AppLayout />;
};
