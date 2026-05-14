import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Briefcase, KeyRound, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  DEFAULT_POST_AUTH_TARGET,
  postAuthTargetFromLocation,
  storePostAuthTarget,
  takePostAuthTarget,
} from "@/lib/authRedirect";
import { loadPreOnboardingDraft, savePreOnboardingDraft } from "@/lib/preOnboarding";

type AuthLocationState = {
  from?: {
    pathname?: string;
    search?: string;
    hash?: string;
  };
};

const Auth = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signIn, sendMagicLink } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [linkSent, setLinkSent] = useState(false);
  const [email, setEmail] = useState(() => loadPreOnboardingDraft()?.email ?? "");
  const [password, setPassword] = useState("");

  useEffect(() => {
    const target = postAuthTargetFromLocation((location.state as AuthLocationState | null)?.from);
    storePostAuthTarget(target);
  }, [location.state]);

  useEffect(() => {
    if (!user) return;
    navigate(takePostAuthTarget() || DEFAULT_POST_AUTH_TARGET, { replace: true });
  }, [user, navigate]);

  const handleMagicLink = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    const draft = loadPreOnboardingDraft();
    savePreOnboardingDraft({ ...(draft ?? {}), email });
    const { error } = await sendMagicLink(email.trim(), `${window.location.origin}/auth/callback`);
    setLoading(false);
    if (error) {
      toast({ title: "Kunne ikke sende innloggingslenke", description: error.message, variant: "destructive" });
      return;
    }
    setLinkSent(true);
  };

  const handleSignIn = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    const { error } = await signIn(email.trim(), password);
    setLoading(false);
    if (error) {
      toast({ title: "Innlogging feilet", description: error.message, variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-subtle p-4">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center justify-center gap-2 mb-8">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-elevated">
            <Briefcase className="w-5 h-5 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-semibold">Søkly</h1>
        </Link>

        <Card className="shadow-elevated">
          <CardHeader>
            <CardTitle>Fortsett jobbsøket</CardTitle>
            <CardDescription>Send en sikker lenke til e-posten din. Passord kan settes senere.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="magic">
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="magic">E-postlenke</TabsTrigger>
                <TabsTrigger value="password">Passord</TabsTrigger>
              </TabsList>

              <TabsContent value="magic">
                <form onSubmit={handleMagicLink} className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="magic-email">E-post</Label>
                    <Input
                      id="magic-email"
                      type="email"
                      required
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="deg@epost.no"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading || !email.trim()}>
                    {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Mail className="w-4 h-4 mr-2" />}
                    Send innloggingslenke
                  </Button>
                  {linkSent && (
                    <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
                      <div className="font-medium">Lenke sendt</div>
                      <p className="text-muted-foreground mt-1">Åpne e-posten på samme enhet for å fortsette der du slapp.</p>
                    </div>
                  )}
                </form>
              </TabsContent>

              <TabsContent value="password">
                <form onSubmit={handleSignIn} className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="signin-email">E-post</Label>
                    <Input
                      id="signin-email"
                      type="email"
                      required
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signin-password">Passord</Label>
                    <Input
                      id="signin-password"
                      type="password"
                      required
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                  </div>
                  <Button type="submit" variant="outline" className="w-full" disabled={loading}>
                    {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <KeyRound className="w-4 h-4 mr-2" />}
                    Logg inn med passord
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground text-center mt-4">
          Vil du se verdien først? <Link to="/start" className="text-primary hover:underline">Start med en kort profil.</Link>
        </p>
      </div>
    </div>
  );
};

export default Auth;
