import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Loader2, Save, Plus, Trash2, GripVertical, Upload, Sparkles, FileText } from "lucide-react";

type Experience = {
  title: string; company: string; location?: string;
  start: string; end?: string; current?: boolean;
  description?: string; bullets: string[]; technologies: string[];
};
type Education = { degree: string; institution: string; start: string; end?: string; description?: string };
type SkillGroup = { category: string; items: string[] };
type Language = { name: string; level: string };
type Project = { name: string; description: string; url?: string; technologies: string[] };
type Cert = { name: string; issuer: string; date?: string; url?: string };

type CV = {
  id?: string;
  full_name: string | null;
  headline: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  linkedin_url: string | null;
  website_url: string | null;
  intro: string;
  experiences: Experience[];
  education: Education[];
  skills: SkillGroup[];
  languages: Language[];
  projects: Project[];
  certifications: Cert[];
};

const empty: CV = {
  full_name: "", headline: "", email: "", phone: "", location: "",
  linkedin_url: "", website_url: "", intro: "",
  experiences: [], education: [], skills: [], languages: [], projects: [], certifications: [],
};

const CvTemplate = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [cv, setCv] = useState<CV>(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");

  useEffect(() => { load(); }, [user]);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase.from("cv_templates")
      .select("*").eq("user_id", user.id).eq("is_active", true).maybeSingle();
    if (data) {
      setCv({
        ...data,
        experiences: (data.experiences as any) ?? [],
        education: (data.education as any) ?? [],
        skills: (data.skills as any) ?? [],
        languages: (data.languages as any) ?? [],
        projects: (data.projects as any) ?? [],
        certifications: (data.certifications as any) ?? [],
      } as CV);
    } else {
      // Pre-fill from profile
      const { data: prof } = await supabase.from("profiles")
        .select("display_name, email, linkedin_url").eq("user_id", user.id).maybeSingle();
      if (prof) setCv({ ...empty, full_name: prof.display_name ?? "", email: prof.email ?? "", linkedin_url: prof.linkedin_url ?? "" });
    }
    setLoading(false);
  };

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const payload = {
      user_id: user.id, is_active: true,
      full_name: cv.full_name, headline: cv.headline, email: cv.email,
      phone: cv.phone, location: cv.location, linkedin_url: cv.linkedin_url, website_url: cv.website_url,
      intro: cv.intro,
      experiences: cv.experiences as any, education: cv.education as any,
      skills: cv.skills as any, languages: cv.languages as any,
      projects: cv.projects as any, certifications: cv.certifications as any,
    };
    const { error } = cv.id
      ? await supabase.from("cv_templates").update(payload).eq("id", cv.id)
      : await supabase.from("cv_templates").insert(payload);
    setSaving(false);
    if (error) toast({ title: "Lagring feilet", description: error.message, variant: "destructive" });
    else { toast({ title: "Lagret" }); load(); }
  };

  const applyImported = (imported: any) => {
    // Merge — overwrite fields the AI populated, keep existing for empty results
    setCv((prev) => ({
      ...prev,
      full_name: imported.full_name ?? prev.full_name,
      headline: imported.headline ?? prev.headline,
      email: imported.email ?? prev.email,
      phone: imported.phone ?? prev.phone,
      location: imported.location ?? prev.location,
      linkedin_url: imported.linkedin_url ?? prev.linkedin_url,
      website_url: imported.website_url ?? prev.website_url,
      intro: imported.intro || prev.intro,
      experiences: imported.experiences?.length ? imported.experiences : prev.experiences,
      education: imported.education?.length ? imported.education : prev.education,
      skills: imported.skills?.length ? imported.skills : prev.skills,
      languages: imported.languages?.length ? imported.languages : prev.languages,
      projects: imported.projects?.length ? imported.projects : prev.projects,
      certifications: imported.certifications?.length ? imported.certifications : prev.certifications,
    }));
  };

  const importFromText = async () => {
    if (!pasteText.trim()) return;
    setImporting(true);
    const { data, error } = await supabase.functions.invoke("import-cv", {
      body: { text: pasteText },
    });
    setImporting(false);
    if (error || !data?.cv) {
      toast({ title: "Import feilet", description: error?.message ?? "Ukjent feil", variant: "destructive" });
      return;
    }
    applyImported(data.cv);
    setPasteOpen(false);
    setPasteText("");
    toast({ title: "CV importert", description: "Sjekk feltene og lagre når du er fornøyd." });
  };

  const importFromPdf = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "For stor fil", description: "Maks 10 MB", variant: "destructive" });
      return;
    }
    setImporting(true);
    try {
      const buf = await file.arrayBuffer();
      // Convert to base64 in chunks to avoid call-stack overflow
      const bytes = new Uint8Array(buf);
      let binary = "";
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
      }
      const b64 = btoa(binary);
      const { data, error } = await supabase.functions.invoke("import-cv", {
        body: { pdf_base64: b64, mime_type: file.type || "application/pdf" },
      });
      if (error || !data?.cv) {
        toast({ title: "Import feilet", description: error?.message ?? "Ukjent feil", variant: "destructive" });
        return;
      }
      applyImported(data.cv);
      toast({ title: "CV importert fra PDF", description: "Sjekk feltene og lagre når du er fornøyd." });
    } finally {
      setImporting(false);
    }
  };

  if (loading) return <div className="p-8 flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Laster…</div>;

  return (
    <div className="max-w-4xl mx-auto p-6 lg:p-10 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">CV-mal</h1>
          <p className="text-muted-foreground text-sm mt-1">Strukturert CV som AI bruker som faktagrunnlag for hver søknad.</p>
        </div>
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Lagre
        </Button>
      </header>

      {/* Import CV */}
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" /> Importer eksisterende CV
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Last opp en PDF eller lim inn tekst. AI fyller ut malen automatisk — du justerer etterpå.
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <label className={importing ? "pointer-events-none opacity-60" : "cursor-pointer"}>
            <input
              type="file"
              className="hidden"
              accept=".pdf,application/pdf"
              disabled={importing}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importFromPdf(f);
                e.target.value = "";
              }}
            />
            <span className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-input bg-background hover:bg-accent text-sm">
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Last opp PDF
            </span>
          </label>
          <Button variant="outline" onClick={() => setPasteOpen(true)} disabled={importing}>
            <FileText className="w-4 h-4 mr-2" /> Lim inn tekst
          </Button>
          {importing && <span className="text-xs text-muted-foreground self-center">AI leser CV'en…</span>}
        </CardContent>
      </Card>

      <Dialog open={pasteOpen} onOpenChange={setPasteOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Lim inn CV-tekst</DialogTitle>
            <DialogDescription>Kopier hele CV-teksten din inn her. AI strukturerer den til malen.</DialogDescription>
          </DialogHeader>
          <Textarea
            rows={14}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="Lim inn CV-teksten her…"
            className="font-mono text-sm"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasteOpen(false)}>Avbryt</Button>
            <Button onClick={importFromText} disabled={importing || !pasteText.trim()}>
              {importing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
              Importer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Header info */}
      <Card>
        <CardHeader><CardTitle className="text-base">Kontakt</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <Field label="Fullt navn" value={cv.full_name ?? ""} onChange={(v) => setCv({ ...cv, full_name: v })} />
          <Field label="Tittel/headline" value={cv.headline ?? ""} onChange={(v) => setCv({ ...cv, headline: v })} placeholder="f.eks. Senior systemutvikler" />
          <Field label="Epost" value={cv.email ?? ""} onChange={(v) => setCv({ ...cv, email: v })} />
          <Field label="Telefon" value={cv.phone ?? ""} onChange={(v) => setCv({ ...cv, phone: v })} />
          <Field label="Sted" value={cv.location ?? ""} onChange={(v) => setCv({ ...cv, location: v })} />
          <Field label="LinkedIn" value={cv.linkedin_url ?? ""} onChange={(v) => setCv({ ...cv, linkedin_url: v })} />
          <Field label="Nettsted" value={cv.website_url ?? ""} onChange={(v) => setCv({ ...cv, website_url: v })} />
        </CardContent>
      </Card>

      {/* Intro */}
      <Card>
        <CardHeader><CardTitle className="text-base">Introduksjon</CardTitle><p className="text-xs text-muted-foreground">Generell elevator pitch (AI tilpasser per søknad).</p></CardHeader>
        <CardContent>
          <Textarea rows={4} value={cv.intro} onChange={(e) => setCv({ ...cv, intro: e.target.value })} placeholder="Kort om deg, sentrale styrker, hva du leter etter…" />
        </CardContent>
      </Card>

      {/* Experiences */}
      <SectionList
        title="Erfaring"
        items={cv.experiences}
        onChange={(items) => setCv({ ...cv, experiences: items })}
        empty={{ title: "", company: "", location: "", start: "", end: "", current: false, description: "", bullets: [], technologies: [] }}
        render={(item, set) => (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Stillingstittel" value={item.title} onChange={(v) => set({ ...item, title: v })} />
              <Field label="Selskap" value={item.company} onChange={(v) => set({ ...item, company: v })} />
              <Field label="Sted" value={item.location ?? ""} onChange={(v) => set({ ...item, location: v })} />
              <div className="grid grid-cols-2 gap-2">
                <Field label="Fra" value={item.start} onChange={(v) => set({ ...item, start: v })} placeholder="2022-08" />
                <Field label="Til" value={item.end ?? ""} onChange={(v) => set({ ...item, end: v })} placeholder="2024-03 / nå" />
              </div>
            </div>
            <div className="space-y-2 mt-3">
              <Label>Beskrivelse</Label>
              <Textarea rows={2} value={item.description ?? ""} onChange={(e) => set({ ...item, description: e.target.value })} />
            </div>
            <ChipList label="Bullet points / oppgaver" items={item.bullets} onChange={(b) => set({ ...item, bullets: b })} />
            <ChipList label="Teknologier" items={item.technologies} onChange={(t) => set({ ...item, technologies: t })} />
          </>
        )}
        labelKey={(it) => `${it.title || "(uten tittel)"} – ${it.company || ""}`}
      />

      {/* Education */}
      <SectionList
        title="Utdanning"
        items={cv.education}
        onChange={(items) => setCv({ ...cv, education: items })}
        empty={{ degree: "", institution: "", start: "", end: "", description: "" }}
        render={(item, set) => (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Grad" value={item.degree} onChange={(v) => set({ ...item, degree: v })} />
            <Field label="Institusjon" value={item.institution} onChange={(v) => set({ ...item, institution: v })} />
            <Field label="Fra" value={item.start} onChange={(v) => set({ ...item, start: v })} placeholder="2018" />
            <Field label="Til" value={item.end ?? ""} onChange={(v) => set({ ...item, end: v })} placeholder="2021" />
            <div className="col-span-2 space-y-2">
              <Label>Beskrivelse</Label>
              <Textarea rows={2} value={item.description ?? ""} onChange={(e) => set({ ...item, description: e.target.value })} />
            </div>
          </div>
        )}
        labelKey={(it) => `${it.degree || "(uten grad)"} – ${it.institution || ""}`}
      />

      {/* Skills */}
      <SectionList
        title="Ferdigheter"
        items={cv.skills}
        onChange={(items) => setCv({ ...cv, skills: items })}
        empty={{ category: "", items: [] }}
        render={(item, set) => (
          <>
            <Field label="Kategori" value={item.category} onChange={(v) => set({ ...item, category: v })} placeholder="f.eks. Programmeringsspråk" />
            <ChipList label="Ferdigheter" items={item.items} onChange={(it) => set({ ...item, items: it })} />
          </>
        )}
        labelKey={(it) => it.category || "(uten kategori)"}
      />

      {/* Languages */}
      <SectionList
        title="Språk"
        items={cv.languages}
        onChange={(items) => setCv({ ...cv, languages: items })}
        empty={{ name: "", level: "" }}
        render={(item, set) => (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Språk" value={item.name} onChange={(v) => set({ ...item, name: v })} />
            <Field label="Nivå" value={item.level} onChange={(v) => set({ ...item, level: v })} placeholder="morsmål / flytende / B2 …" />
          </div>
        )}
        labelKey={(it) => `${it.name} (${it.level})`}
      />

      {/* Projects */}
      <SectionList
        title="Prosjekter"
        items={cv.projects}
        onChange={(items) => setCv({ ...cv, projects: items })}
        empty={{ name: "", description: "", url: "", technologies: [] }}
        render={(item, set) => (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Navn" value={item.name} onChange={(v) => set({ ...item, name: v })} />
              <Field label="URL" value={item.url ?? ""} onChange={(v) => set({ ...item, url: v })} />
            </div>
            <div className="space-y-2 mt-3">
              <Label>Beskrivelse</Label>
              <Textarea rows={2} value={item.description} onChange={(e) => set({ ...item, description: e.target.value })} />
            </div>
            <ChipList label="Teknologier" items={item.technologies} onChange={(t) => set({ ...item, technologies: t })} />
          </>
        )}
        labelKey={(it) => it.name || "(uten navn)"}
      />

      {/* Certifications */}
      <SectionList
        title="Sertifikater"
        items={cv.certifications}
        onChange={(items) => setCv({ ...cv, certifications: items })}
        empty={{ name: "", issuer: "", date: "", url: "" }}
        render={(item, set) => (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Navn" value={item.name} onChange={(v) => set({ ...item, name: v })} />
            <Field label="Utsteder" value={item.issuer} onChange={(v) => set({ ...item, issuer: v })} />
            <Field label="Dato" value={item.date ?? ""} onChange={(v) => set({ ...item, date: v })} />
            <Field label="URL" value={item.url ?? ""} onChange={(v) => set({ ...item, url: v })} />
          </div>
        )}
        labelKey={(it) => `${it.name} – ${it.issuer}`}
      />
    </div>
  );
};

const Field = ({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) => (
  <div className="space-y-2">
    <Label>{label}</Label>
    <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
  </div>
);

const ChipList = ({ label, items, onChange }: { label: string; items: string[]; onChange: (v: string[]) => void }) => {
  const [input, setInput] = useState("");
  const add = () => { if (!input.trim()) return; onChange([...items, input.trim()]); setInput(""); };
  return (
    <div className="space-y-2 mt-3">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it, i) => (
          <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-accent text-accent-foreground text-xs">
            {it}
            <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} className="hover:text-destructive">×</button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())} placeholder="Skriv og trykk Enter…" />
        <Button type="button" variant="outline" onClick={add}><Plus className="w-4 h-4" /></Button>
      </div>
    </div>
  );
};

function SectionList<T>({ title, items, onChange, render, empty, labelKey }: {
  title: string;
  items: T[];
  onChange: (items: T[]) => void;
  render: (item: T, set: (item: T) => void) => React.ReactNode;
  empty: T;
  labelKey: (item: T) => string;
}) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">{title}</CardTitle>
        <Button variant="outline" size="sm" onClick={() => { onChange([...items, empty]); setOpenIdx(items.length); }}>
          <Plus className="w-4 h-4 mr-1" /> Legg til
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 && <p className="text-sm text-muted-foreground italic">Ingen ennå.</p>}
        {items.map((item, i) => (
          <div key={i} className="border border-border rounded-md">
            <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-accent/30" onClick={() => setOpenIdx(openIdx === i ? null : i)}>
              <div className="flex items-center gap-2 min-w-0">
                <GripVertical className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm truncate">{labelKey(item)}</span>
              </div>
              <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onChange(items.filter((_, j) => j !== i)); }}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
            {openIdx === i && (
              <div className="p-3 border-t border-border">
                {render(item, (next) => onChange(items.map((it, j) => (j === i ? next : it))))}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default CvTemplate;
