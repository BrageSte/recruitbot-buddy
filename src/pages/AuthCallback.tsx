import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  answersFromPreOnboardingDraft,
  clearPreOnboardingDraft,
  hasUsefulPreOnboardingDraft,
  loadPreOnboardingDraft,
  questionsFromPreOnboardingDraft,
} from "@/lib/preOnboarding";

const AuthCallback = () => {
  const navigate = useNavigate();
  const [message, setMessage] = useState("Logger deg inn...");

  useEffect(() => {
    let cancelled = false;

    const finish = async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session?.user) {
        setMessage("Kunne ikke bekrefte lenken. Prøv å sende en ny innloggingslenke.");
        window.setTimeout(() => {
          if (!cancelled) navigate("/auth", { replace: true });
        }, 1800);
        return;
      }

      const draft = loadPreOnboardingDraft();
      if (hasUsefulPreOnboardingDraft(draft)) {
        setMessage("Henter med profilen du startet...");
        const questions = questionsFromPreOnboardingDraft();
        const answers = answersFromPreOnboardingDraft(draft);

        await (supabase as any).from("profiles").upsert(
          {
            user_id: session.user.id,
            email: session.user.email,
            linkedin_url: draft?.linkedinUrl || null,
          },
          { onConflict: "user_id" },
        );

        const { data: existing } = await (supabase as any)
          .from("profile_onboarding_runs")
          .select("id")
          .eq("user_id", session.user.id)
          .is("completed_at", null)
          .neq("status", "skipped")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const payload = {
          user_id: session.user.id,
          current_step: "cv",
          status: "draft",
          preauth_draft: draft,
          answers: { questions, values: answers },
          linkedin_draft: draft?.linkedinUrl ? { url: draft.linkedinUrl, status: "pending" } : {},
        };

        if (existing?.id) {
          await (supabase as any).from("profile_onboarding_runs").update(payload).eq("id", existing.id);
        } else {
          await (supabase as any).from("profile_onboarding_runs").insert(payload);
        }
        clearPreOnboardingDraft();
      }

      if (!cancelled) navigate("/onboarding", { replace: true });
    };

    void finish();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gradient-subtle flex items-center justify-center p-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        {message}
      </div>
    </div>
  );
};

export default AuthCallback;
