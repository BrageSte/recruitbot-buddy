import { lazy, Suspense, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/AuthProvider";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { RouteFallback } from "@/components/RouteFallback";

const Auth = lazy(() => import("./pages/Auth"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const Start = lazy(() => import("./pages/Start"));
const Landing = lazy(() => import("./pages/Landing"));
const Demo = lazy(() => import("./pages/Demo"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Jobs = lazy(() => import("./pages/Jobs"));
const JobSwipe = lazy(() => import("./pages/JobSwipe"));
const JobDetail = lazy(() => import("./pages/JobDetail"));
const Applications = lazy(() => import("./pages/Applications"));
const ApplicationDetail = lazy(() => import("./pages/ApplicationDetail"));
const Profile = lazy(() => import("./pages/Profile"));
const Sources = lazy(() => import("./pages/Sources"));
const CvTemplate = lazy(() => import("./pages/CvTemplate"));
const CalendarPage = lazy(() => import("./pages/CalendarPage"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

const queryClient = new QueryClient();

const renderRoute = (element: ReactNode, fullscreen = false) => (
  <Suspense fallback={<RouteFallback fullscreen={fullscreen} />}>
    {element}
  </Suspense>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <ErrorBoundary>
            <Routes>
              <Route path="/start" element={renderRoute(<Start />, true)} />
              <Route path="/demo" element={renderRoute(<Demo />, true)} />
              <Route path="/" element={renderRoute(<Landing />, true)} />
              <Route path="/landing" element={<Navigate to="/" replace />} />
              <Route path="/login" element={renderRoute(<Auth />, true)} />
              <Route path="/auth" element={<Navigate to="/login" replace />} />
              <Route path="/auth/callback" element={renderRoute(<AuthCallback />, true)} />
              <Route
                path="/onboarding"
                element={<ProtectedRoute>{renderRoute(<Onboarding />, true)}</ProtectedRoute>}
              />
              <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                <Route path="/portal" element={renderRoute(<Dashboard />)} />
                <Route path="/matches" element={<Navigate to="/jobs" replace />} />
                <Route path="/jobs" element={renderRoute(<Jobs />)} />
                <Route path="/jobs/swipe" element={renderRoute(<JobSwipe />)} />
                <Route path="/jobs/:id" element={renderRoute(<JobDetail />)} />
                <Route path="/applications" element={renderRoute(<Applications />)} />
                <Route path="/applications/:id" element={renderRoute(<ApplicationDetail />)} />
                <Route path="/profile" element={renderRoute(<Profile />)} />
                <Route path="/sources" element={renderRoute(<Sources />)} />
                <Route path="/auto-search" element={<Navigate to="/sources" replace />} />
                <Route path="/cv" element={renderRoute(<CvTemplate />)} />
                <Route path="/calendar" element={renderRoute(<CalendarPage />)} />
              </Route>
              <Route path="*" element={renderRoute(<NotFound />, true)} />
            </Routes>
          </ErrorBoundary>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
