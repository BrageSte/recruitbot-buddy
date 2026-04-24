import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Upload, FileText, Trash2 } from "lucide-react";

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
};

type UploadedFile = {
  id: string;
  kind: string;
  file_name: string;
  storage_path: string;
  created_at: string;
};

const Profile = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadAll(); }, [user]);

  const loadAll = async () => {
    if (!user) return;
    setLoading(true);
    const [{ data: prof }, { data: fls }] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("uploaded_files").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
    ]);
    if (prof) setProfile(prof as any);
    if (fls) setFiles(fls as any);
    setLoading(false);
  };

  const save = async () => {
    if (!user || !profile) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
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
    setSaving(false);
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

  const totalWeight = (profile?.weight_professional ?? 0) + (profile?.weight_culture ?? 0) + (profile?.weight_practical ?? 0) + (profile?.weight_enthusiasm ?? 0);

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
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Lagre
        </Button>
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
          <CardTitle className="text-base">Master-profil</CardTitle>
          <p className="text-xs text-muted-foreground">Markdown. Beskriv kjernehistorier, styrker, erfaringer, preferanser. AI bruker dette i ALT.</p>
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
    </div>
  );
};

export default Profile;
