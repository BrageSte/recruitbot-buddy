import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, Upload, FileText, Trash2, Zap, Plus, Sparkles, Wand2 } from "lucide-react";

type Profile = {
  display_name: string | null;
  email: string | null;
  master_profile: string | null;
  style_guide: string | null;
  linkedin_url: string | null;
  weight_professional: number;
  weight_culture: number;
  weight_practical: number;
  weight_enthusiasm: number;
  rules_green: string | null;
  rules_yellow: string | null;
  rules_red: string | null;
  weekly_goal: number;
  onboarding_completed_at?: string | null;
  onboarding_skipped_at?: string | null;
};

type UploadedFile = {
  id: string;
  kind: string;
  file_name: string;
  storage_path: string;
  created_at: string;
};

type InterestSignal = {
  id: string;
  label: string;
  category: string;
  weight: number;
  source: string;
  confidence: number;
};

type AutoApply = {
  is_enabled: boolean;
  min_score: number;
  daily_limit: number;
  only_from_rss: boolean;
  exclude_with_risks: boolean;
};

const defaultAuto: AutoApply = {
  is_enabled: false,
  min_score: 80,
  daily_limit: 5,
  only_from_rss: false,
  exclude_with_risks: true,
};

const signalCategoryLabels: Record<string, string> = {
  role: "Rolle",
  industry: "Bransje",
  task: "Oppgave",
  skill: "Ferdighet",
  value: "Verdi",
  work_style: "Arbeidsform",
  location: "Sted",
  dealbreaker: "Dealbreaker",
  other: "Annet",
};

const extractSection = (markdown: string | null | undefined, title: string) => {
  if (!markdown) return "";
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^#{1,3}\\s+${escaped}\\s*$([\\s\\S]*?)(?=^#{1,3}\\s+|\\s*$)`, "im");
  return markdown.match(re)?.[1]?.trim() ?? "";
};

const profilePreviewSections = (markdown: string | null | undefined) => {
  const about = extractSection(markdown, "Om meg");
  const lookingFor = extractSection(markdown, "Hva jeg ser etter");
  const interests = extractSection(markdown, "Interesser og sterke signaler") || extractSection(markdown, "Interesser");
  const constraints = extractSection(markdown, "Rammer");
  const dealbreakers = extractSection(markdown, "Dealbreakers");

  return [
    { label: "Om meg", value: about },
    { label: "Hva jeg ser etter", value: lookingFor },
    { label: "Interesser", value: interests },
    { label: "Rammer", value: constraints },
    { label: "Dealbreakers", value: dealbreakers },
  ];
};

const Profile = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [signals, setSignals] = useState<InterestSignal[]>([]);
  const [auto, setAuto] = useState<AutoApply>(defaultAuto);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [signalLabel, setSignalLabel] = useState("");
  const [signalCategory, setSignalCategory] = useState("task");
  const [signalWeight, setSignalWeight] = useState(70);

  useEffect(() => { loadAll(); }, [user]);

  const loadAll = async () => {
    if (!user) return;
    setLoading(true);
    const [{ data: prof }, { data: fls }, { data: au }, { data: sig }] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("uploaded_files").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("auto_apply_settings").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("profile_interest_signals").select("*").eq("user_id", user.id).order("weight", { ascending: false }),
    ]);
    if (prof) setProfile(prof as any);
    if (fls) setFiles(fls as any);
    if (sig) setSignals(sig as any);
    if (au) setAuto({
      is_enabled: au.is_enabled,
      min_score: au.min_score,
      daily_limit: au.daily_limit,
      only_from_rss: au.only_from_rss,
      exclude_with_risks: au.exclude_with_risks,
    });
    setLoading(false);
  };

  const save = async () => {
    if (!user || !profile) return;
    setSaving(true);
    const profPromise = supabase.from("profiles").update({
      display_name: profile.display_name,
      master_profile: profile.master_profile,
      style_guide: profile.style_guide,
      linkedin_url: profile.linkedin_url,
      weight_professional: profile.weight_professional,
      weight_culture: profile.weight_culture,
      weight_practical: profile.weight_practical,
      weight_enthusiasm: profile.weight_enthusiasm,
      rules_green: profile.rules_green,
      rules_yellow: profile.rules_yellow,
      rules_red: profile.rules_red,
      weekly_goal: profile.weekly_goal,
    }).eq("user_id", user.id);

    const autoPromise = supabase.from("auto_apply_settings").upsert(
      { user_id: user.id, ...auto },
      { onConflict: "user_id" }
    );

    const [{ error: e1 }, { error: e2 }] = await Promise.all([profPromise, autoPromise]);
    setSaving(false);
    const error = e1 || e2;
    if (error) toast({ title: "Kunne ikke lagre", description: error.message, variant: "destructive" });
    else toast({ title: "Lagret" });
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, kind: "cv" | "previous_application") => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const path = `${user.id}/${kind}/${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("user-files").upload(path, file);
    if (upErr) {
      toast({ title: "Opplasting feilet", description: upErr.message, variant: "destructive" });
      return;
    }
    const { error: insErr } = await supabase.from("uploaded_files").insert({
      user_id: user.id, kind, file_name: file.name, storage_path: path,
      mime_type: file.type, size_bytes: file.size,
    });
    if (insErr) toast({ title: "Lagring feilet", description: insErr.message, variant: "destructive" });
    else { toast({ title: "Lastet opp" }); loadAll(); }
    e.target.value = "";
  };

  const deleteFile = async (f: UploadedFile) => {
    await supabase.storage.from("user-files").remove([f.storage_path]);
    await supabase.from("uploaded_files").delete().eq("id", f.id);
    loadAll();
  };

  const addSignal = async () => {
    if (!user || !signalLabel.trim()) return;
    const { error } = await supabase.from("profile_interest_signals").insert({
      user_id: user.id,
      label: signalLabel.trim(),
      category: signalCategory as any,
      weight: signalWeight,
      source: "manual" as any,
      confidence: 1,
    });
    if (error) {
      toast({ title: "Kunne ikke legge til signal", description: error.message, variant: "destructive" });
    } else {
      setSignalLabel("");
      setSignalWeight(70);
      loadAll();
    }
  };

  const updateSignalWeight = async (signal: InterestSignal, weight: number) => {
    setSignals((items) => items.map((s) => (s.id === signal.id ? { ...s, weight } : s)));
    await supabase.from("profile_interest_signals").update({ weight }).eq("id", signal.id);
  };

  const deleteSignal = async (id: string) => {
    await supabase.from("profile_interest_signals").delete().eq("id", id);
    setSignals((items) => items.filter((s) => s.id !== id));
  };

  const totalWeight = (profile?.weight_professional ?? 0) + (profile?.weight_culture ?? 0) + (profile?.weight_practical ?? 0) + (profile?.weight_enthusiasm ?? 0);
  const previewSections = profilePreviewSections(profile?.master_profile);
  const hasStructuredPreview = previewSections.some((section) => section.value);

  if (loading || !profile) {
    return <div className="p-8 flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Laster…</div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-6 lg:p-10 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Profil</h1>
          <p className="text-muted-foreground text-sm mt-1">Kilden AI bruker for å score jobber og skrive søknader.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link to="/onboarding?rerun=1">
              <Wand2 className="w-4 h-4 mr-2" />
              Bygg interesseprofil på nytt
            </Link>
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Lagre
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader><CardTitle className="text-base">Grunnleggende</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Navn</Label>
              <Input value={profile.display_name ?? ""} onChange={(e) => setProfile({ ...profile, display_name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>LinkedIn URL</Label>
              <Input value={profile.linkedin_url ?? ""} onChange={(e) => setProfile({ ...profile, linkedin_url: e.target.value })} placeholder="https://linkedin.com/in/..." />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            Interesseprofil
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Strukturert oversikt over hvem du er, hva du vil mot, og hva matchmotoren bør prioritere.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {hasStructuredPreview ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {previewSections.map((section) => (
                <div key={section.label} className="rounded-md border border-border bg-muted/20 p-3">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{section.label}</div>
                  <p className="text-sm mt-2 whitespace-pre-line line-clamp-5">
                    {section.value || "Ikke utfylt ennå."}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-border p-5">
              <p className="text-sm text-muted-foreground">
                Profilen er ikke strukturert i seksjoner ennå. Kjør guidet onboarding for å lage en tydeligere "om meg", retning, rammer og dealbreakers.
              </p>
              <Button asChild className="mt-4">
                <Link to="/onboarding?rerun=1">
                  <Wand2 className="w-4 h-4 mr-2" />
                  Bygg interesseprofil
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Detaljert profiltekst</CardTitle>
          <p className="text-xs text-muted-foreground">Markdown som AI bruker i matcher og søknader. Onboarding kan generere denne, men du kan fortsatt finjustere her.</p>
        </CardHeader>
        <CardContent>
          <Textarea
            value={profile.master_profile ?? ""}
            onChange={(e) => setProfile({ ...profile, master_profile: e.target.value })}
            rows={14}
            className="font-mono text-sm"
            placeholder={`# Om meg\n\n## Kjernehistorier\n- ...\n\n## Styrker\n- ...\n\n## Preferanser\n- Jeg vil jobbe med ...`}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Stil-guide</CardTitle>
          <p className="text-xs text-muted-foreground">Tone, struktur, do/don't for søknader.</p>
        </CardHeader>
        <CardContent>
          <Textarea
            value={profile.style_guide ?? ""}
            onChange={(e) => setProfile({ ...profile, style_guide: e.target.value })}
            rows={8}
            className="font-mono text-sm"
            placeholder={`Tone: direkte, varm, ikke salgsspråk\nDo: konkret, bruk tall, knytt til kjernehistorier\nDon't: floskler, "passion for excellence"`}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Søkekriterier — vekting</CardTitle>
          <p className="text-xs text-muted-foreground">Sum bør være 100. Nå: <span className={totalWeight === 100 ? "text-success" : "text-warning"}>{totalWeight}</span></p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { key: "weight_professional", label: "Fag" },
              { key: "weight_culture", label: "Kultur" },
              { key: "weight_practical", label: "Praktisk" },
              { key: "weight_enthusiasm", label: "Entusiasme" },
            ].map(({ key, label }) => (
              <div key={key} className="space-y-2">
                <Label>{label}</Label>
                <Input type="number" min={0} max={100} value={(profile as any)[key]} onChange={(e) => setProfile({ ...profile, [key]: parseInt(e.target.value) || 0 } as Profile)} />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-4 mt-6">
            <div className="space-y-2">
              <Label className="text-score-green">Grønn-regler</Label>
              <Textarea rows={4} value={profile.rules_green ?? ""} onChange={(e) => setProfile({ ...profile, rules_green: e.target.value })} placeholder="Tegn på god match" />
            </div>
            <div className="space-y-2">
              <Label className="text-score-yellow">Gul-regler</Label>
              <Textarea rows={4} value={profile.rules_yellow ?? ""} onChange={(e) => setProfile({ ...profile, rules_yellow: e.target.value })} placeholder="Vurder med forsiktighet" />
            </div>
            <div className="space-y-2">
              <Label className="text-score-red">Rød-regler</Label>
              <Textarea rows={4} value={profile.rules_red ?? ""} onChange={(e) => setProfile({ ...profile, rules_red: e.target.value })} placeholder="Dealbreakers" />
            </div>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Ukentlig søknadsmål</Label>
              <Input type="number" min={0} value={profile.weekly_goal} onChange={(e) => setProfile({ ...profile, weekly_goal: parseInt(e.target.value) || 0 })} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            Tags og signaler
          </CardTitle>
          <p className="text-xs text-muted-foreground">Strukturerte signaler matchmotoren bruker sammen med CV, profil og sveip.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_120px_auto] gap-3 items-end">
            <div className="space-y-2">
              <Label>Nytt signal</Label>
              <Input value={signalLabel} onChange={(e) => setSignalLabel(e.target.value)} placeholder="f.eks. produktutvikling, kundekontakt, hjemmekontor" />
            </div>
            <div className="space-y-2">
              <Label>Kategori</Label>
              <Select value={signalCategory} onValueChange={setSignalCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="role">Rolle</SelectItem>
                  <SelectItem value="industry">Bransje</SelectItem>
                  <SelectItem value="task">Oppgave</SelectItem>
                  <SelectItem value="skill">Ferdighet</SelectItem>
                  <SelectItem value="value">Verdi</SelectItem>
                  <SelectItem value="work_style">Arbeidsform</SelectItem>
                  <SelectItem value="location">Sted</SelectItem>
                  <SelectItem value="dealbreaker">Dealbreaker</SelectItem>
                  <SelectItem value="other">Annet</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Vekt</Label>
              <Input type="number" min={-100} max={100} value={signalWeight} onChange={(e) => setSignalWeight(parseInt(e.target.value) || 0)} />
            </div>
            <Button onClick={addSignal} disabled={!signalLabel.trim()}>
              <Plus className="w-4 h-4 mr-2" />
              Legg til
            </Button>
          </div>

          {signals.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ingen strukturerte interesser ennå. Start med arbeidsoppgaver du liker og tydelige dealbreakers.</p>
          ) : (
            <div className="space-y-2">
              {signals.map((signal) => (
                <div key={signal.id} className="flex items-center gap-3 border border-border rounded-md p-3 bg-card">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{signal.label}</span>
                      <Badge variant={signal.category === "dealbreaker" || signal.weight < 0 ? "destructive" : "secondary"}>
                        {signalCategoryLabels[signal.category] ?? signal.category}
                      </Badge>
                      {signal.source !== "manual" && <Badge variant="outline">{signal.source}</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Positiv vekt løfter matcher. Negativ vekt trekker ned.
                    </div>
                  </div>
                  <Input
                    className="w-24"
                    type="number"
                    min={-100}
                    max={100}
                    value={signal.weight}
                    onChange={(e) => updateSignalWeight(signal, parseInt(e.target.value) || 0)}
                  />
                  <Button variant="ghost" size="icon" onClick={() => deleteSignal(signal.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filer</CardTitle>
          <p className="text-xs text-muted-foreground">CV og tidligere søknader brukes som referanse av AI.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <label className="cursor-pointer">
              <input type="file" className="hidden" accept=".pdf,.md,.txt,.docx" onChange={(e) => handleUpload(e, "cv")} />
              <span className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-input bg-background hover:bg-accent text-sm">
                <Upload className="w-4 h-4" /> Last opp CV
              </span>
            </label>
            <label className="cursor-pointer">
              <input type="file" className="hidden" accept=".pdf,.md,.txt,.docx" onChange={(e) => handleUpload(e, "previous_application")} />
              <span className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-input bg-background hover:bg-accent text-sm">
                <Upload className="w-4 h-4" /> Last opp tidligere søknad
              </span>
            </label>
          </div>
          {files.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ingen filer ennå.</p>
          ) : (
            <div className="space-y-1.5">
              {files.map((f) => (
                <div key={f.id} className="flex items-center justify-between p-2.5 border border-border rounded-md bg-card">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="text-sm truncate">{f.file_name}</span>
                    <span className="text-xs text-muted-foreground px-2 py-0.5 rounded bg-muted">{f.kind === "cv" ? "CV" : "Tidligere"}</span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => deleteFile(f)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" /> Auto-utkast
          </CardTitle>
          <p className="text-xs text-muted-foreground">Når en RSS-jobb scorer høyt, genereres et søknadsutkast automatisk. Du sender selv.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 border border-border rounded-md bg-card">
            <div>
              <div className="text-sm font-medium">Aktivér auto-utkast</div>
              <div className="text-xs text-muted-foreground">Skrur av/på generering ved nye jobber.</div>
            </div>
            <Switch checked={auto.is_enabled} onCheckedChange={(v) => setAuto({ ...auto, is_enabled: v })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Minimum score</Label>
              <Input type="number" min={0} max={100} value={auto.min_score} onChange={(e) => setAuto({ ...auto, min_score: parseInt(e.target.value) || 0 })} />
              <p className="text-xs text-muted-foreground">Kun jobber ≥ denne scoren får utkast.</p>
            </div>
            <div className="space-y-2">
              <Label>Daglig grense</Label>
              <Input type="number" min={0} value={auto.daily_limit} onChange={(e) => setAuto({ ...auto, daily_limit: parseInt(e.target.value) || 0 })} />
              <p className="text-xs text-muted-foreground">Maks antall auto-utkast per dag.</p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between p-3 border border-border rounded-md bg-card">
              <div>
                <div className="text-sm font-medium">Kun fra RSS</div>
                <div className="text-xs text-muted-foreground">Hopp over manuelt lagrede jobber.</div>
              </div>
              <Switch checked={auto.only_from_rss} onCheckedChange={(v) => setAuto({ ...auto, only_from_rss: v })} />
            </div>
            <div className="flex items-center justify-between p-3 border border-border rounded-md bg-card">
              <div>
                <div className="text-sm font-medium">Ekskluder ved risiko-flagg</div>
                <div className="text-xs text-muted-foreground">Hopp over jobber AI flagger som problematiske.</div>
              </div>
              <Switch checked={auto.exclude_with_risks} onCheckedChange={(v) => setAuto({ ...auto, exclude_with_risks: v })} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Profile;
