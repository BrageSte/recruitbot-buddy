import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Loader2, Save, Plus, Trash2, GripVertical, Upload, Sparkles, FileText, Download, Star, Copy, Pencil, ArrowUp, ArrowDown, RotateCcw } from "lucide-react";
import { DEFAULT_SECTION_ORDER, SECTION_LABELS, type CvSectionKey } from "@/components/cv/types";
import { CvStylePicker } from "@/components/cv/CvStylePicker";
import { CvPdfPreview } from "@/components/cv/pdf/CvPdfPreview";
import { CvPdfDocument } from "@/components/cv/pdf/CvPdfDocument";
import { downloadPdfDocument } from "@/components/cv/exportPdf";
import { CvStyleId } from "@/components/cv/cvStyles";

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
  cv_style?: CvStyleId;
  variant_name?: string;
  variant_description?: string | null;
  is_default?: boolean;
  full_name: string | null;
  headline: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  linkedin_url: string | null;
  website_url: string | null;
  photo_url: string | null;
  intro: string;
  section_order: CvSectionKey[];
  experiences: Experience[];
  education: Education[];
  skills: SkillGroup[];
  languages: Language[];
  projects: Project[];
  certifications: Cert[];
};

type VariantSummary = {
  id: string;
  variant_name: string | null;
  variant_description: string | null;
  cv_style: string | null;
  is_default: boolean;
};

const empty: CV = {
  cv_style: "skandinavisk",
  variant_name: "Standard",
  variant_description: "",
  is_default: true,
  full_name: "", headline: "", email: "", phone: "", location: "",
  linkedin_url: "", website_url: "", photo_url: null, intro: "",
  section_order: [...DEFAULT_SECTION_ORDER],
  experiences: [], education: [], skills: [], languages: [], projects: [], certifications: [],
};

const normalizeOrder = (raw: unknown): CvSectionKey[] => {
  const arr = Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : [];
  const valid = arr.filter((k): k is CvSectionKey => (DEFAULT_SECTION_ORDER as string[]).includes(k));
  const seen = new Set(valid);
  for (const k of DEFAULT_SECTION_ORDER) if (!seen.has(k)) valid.push(k);
  return valid;
};

const moveArrayItem = <T,>(items: T[], from: number, to: number): T[] => {
  if (from === to || from < 0 || from >= items.length || to < 0 || to >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

const CvTemplate = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [variants, setVariants] = useState<VariantSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [cv, setCv] = useState<CV>(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameDraft, setRenameDraft] = useState({ name: "", description: "" });

  const loadVariant = useCallback(async (id: string) => {
    const { data } = await supabase.from("cv_templates").select("*").eq("id", id).maybeSingle();
    if (data) {
      setCv({
        ...(data as any),
        variant_name: (data as any).variant_name ?? "Standard",
        section_order: normalizeOrder((data as any).section_order),
        experiences: ((data as any).experiences as any) ?? [],
        education: ((data as any).education as any) ?? [],
        skills: ((data as any).skills as any) ?? [],
        languages: ((data as any).languages as any) ?? [],
        projects: ((data as any).projects as any) ?? [],
        certifications: ((data as any).certifications as any) ?? [],
      } as CV);
      setActiveId(id);
    }
  }, []);

  const initialLoad = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("cv_templates")
      .select("id, variant_name, variant_description, cv_style, is_default")
      .eq("user_id", user.id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true });
    const list = (data ?? []) as VariantSummary[];
    setVariants(list);

    if (list.length === 0) {
      // Pre-fill from profile and create the first variant in-memory.
      const { data: prof } = await supabase
        .from("profiles")
        .select("display_name, email, linkedin_url")
        .eq("user_id", user.id)
        .maybeSingle();
      if (prof) {
        setCv({
          ...empty,
          full_name: prof.display_name ?? "",
          email: prof.email ?? "",
          linkedin_url: prof.linkedin_url ?? "",
        });
      } else {
        setCv(empty);
      }
      setActiveId(null);
    } else {
      const first = list[0];
      await loadVariant(first.id);
    }
    setLoading(false);
  }, [loadVariant, user]);

  useEffect(() => { initialLoad(); }, [initialLoad]);

  const refreshVariants = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("cv_templates")
      .select("id, variant_name, variant_description, cv_style, is_default")
      .eq("user_id", user.id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true });
    setVariants((data ?? []) as VariantSummary[]);
  };

  const switchVariant = async (id: string) => {
    if (id === activeId) return;
    setLoading(true);
    await loadVariant(id);
    setLoading(false);
  };

  const createVariant = async () => {
    if (!user) return;
    const baseName = `Variant ${variants.length + 1}`;
    const payload: any = {
      user_id: user.id,
      is_active: true,
      cv_style: "skandinavisk",
      variant_name: baseName,
      variant_description: "",
      is_default: variants.length === 0,
      full_name: cv.full_name, headline: cv.headline, email: cv.email,
      phone: cv.phone, location: cv.location, linkedin_url: cv.linkedin_url, website_url: cv.website_url,
      photo_url: cv.photo_url,
      intro: "",
      section_order: [...DEFAULT_SECTION_ORDER],
      experiences: [], education: [], skills: [], languages: [], projects: [], certifications: [],
    };
    const { data, error } = await supabase.from("cv_templates").insert(payload).select().maybeSingle();
    if (error || !data) {
      toast({ title: "Kunne ikke opprette", description: error?.message, variant: "destructive" });
      return;
    }
    await refreshVariants();
    await loadVariant((data as any).id);
    toast({ title: "Ny CV opprettet", description: baseName });
  };

  const duplicateVariant = async () => {
    if (!user || !activeId) return;
    const newName = `${cv.variant_name ?? "Standard"} (kopi)`;
    const payload: any = {
      user_id: user.id,
      is_active: true,
      cv_style: cv.cv_style ?? "skandinavisk",
      variant_name: newName,
      variant_description: cv.variant_description ?? "",
      is_default: false,
      full_name: cv.full_name, headline: cv.headline, email: cv.email,
      phone: cv.phone, location: cv.location, linkedin_url: cv.linkedin_url, website_url: cv.website_url,
      photo_url: cv.photo_url,
      intro: cv.intro,
      section_order: cv.section_order,
      experiences: cv.experiences as any, education: cv.education as any,
      skills: cv.skills as any, languages: cv.languages as any,
      projects: cv.projects as any, certifications: cv.certifications as any,
    };
    const { data, error } = await supabase.from("cv_templates").insert(payload).select().maybeSingle();
    if (error || !data) {
      toast({ title: "Kunne ikke duplisere", description: error?.message, variant: "destructive" });
      return;
    }
    await refreshVariants();
    await loadVariant((data as any).id);
    toast({ title: "CV duplisert" });
  };

  const setAsDefault = async () => {
    if (!user || !activeId) return;
    await supabase.from("cv_templates").update({ is_default: false }).eq("user_id", user.id);
    await supabase.from("cv_templates").update({ is_default: true }).eq("id", activeId);
    setCv({ ...cv, is_default: true });
    await refreshVariants();
    toast({ title: "Satt som standard" });
  };

  const deleteVariant = async () => {
    if (!user || !activeId) return;
    if (variants.length <= 1) {
      toast({ title: "Kan ikke slette", description: "Du må ha minst én CV.", variant: "destructive" });
      return;
    }
    if (!confirm(`Slette "${cv.variant_name}"?`)) return;
    const wasDefault = cv.is_default;
    await supabase.from("cv_templates").delete().eq("id", activeId);
    const remaining = variants.filter((v) => v.id !== activeId);
    if (wasDefault && remaining.length > 0) {
      await supabase.from("cv_templates").update({ is_default: true }).eq("id", remaining[0].id);
    }
    await refreshVariants();
    if (remaining.length > 0) await loadVariant(remaining[0].id);
    toast({ title: "Slettet" });
  };

  const openRename = () => {
    setRenameDraft({ name: cv.variant_name ?? "Standard", description: cv.variant_description ?? "" });
    setRenameOpen(true);
  };

  const saveRename = async () => {
    if (!activeId) {
      // Variant not yet persisted — just update local state.
      setCv({ ...cv, variant_name: renameDraft.name, variant_description: renameDraft.description });
    } else {
      await supabase.from("cv_templates").update({
        variant_name: renameDraft.name,
        variant_description: renameDraft.description,
      }).eq("id", activeId);
      setCv({ ...cv, variant_name: renameDraft.name, variant_description: renameDraft.description });
      await refreshVariants();
    }
    setRenameOpen(false);
    toast({ title: "Oppdatert" });
  };

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const payload: any = {
      user_id: user.id,
      is_active: true,
      cv_style: cv.cv_style ?? "skandinavisk",
      variant_name: cv.variant_name ?? "Standard",
      variant_description: cv.variant_description ?? "",
      is_default: cv.is_default ?? false,
      full_name: cv.full_name, headline: cv.headline, email: cv.email,
      phone: cv.phone, location: cv.location, linkedin_url: cv.linkedin_url, website_url: cv.website_url,
      photo_url: cv.photo_url,
      intro: cv.intro,
      section_order: cv.section_order,
      experiences: cv.experiences as any, education: cv.education as any,
      skills: cv.skills as any, languages: cv.languages as any,
      projects: cv.projects as any, certifications: cv.certifications as any,
    };
    let savedId = activeId;
    let error: any = null;
    if (activeId) {
      const r = await supabase.from("cv_templates").update(payload).eq("id", activeId);
      error = r.error;
    } else {
      // First time saving — make sure at least one is default.
      if (variants.length === 0) payload.is_default = true;
      const r = await supabase.from("cv_templates").insert(payload).select().maybeSingle();
      error = r.error;
      savedId = (r.data as any)?.id ?? null;
    }
    setSaving(false);
    if (error) {
      toast({ title: "Lagring feilet", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Lagret" });
      await refreshVariants();
      if (savedId && savedId !== activeId) await loadVariant(savedId);
    }
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

  const exportPdf = async () => {
    await downloadPdfDocument(
      <CvPdfDocument cv={cv as any} styleId={cv.cv_style} />,
      `CV-${(cv.full_name || "uten-navn").replace(/\s+/g, "-")}.pdf`
    );
  };

  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const uploadPhoto = async (file: File) => {
    if (!user) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Ugyldig fil", description: "Velg en bildefil (JPG, PNG, WebP).", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "For stor fil", description: "Maks 5 MB.", variant: "destructive" });
      return;
    }
    setUploadingPhoto(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${user.id}/profile-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("cv-photos").upload(path, file, {
        cacheControl: "3600", upsert: true, contentType: file.type,
      });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("cv-photos").getPublicUrl(path);
      setCv((prev) => ({ ...prev, photo_url: pub.publicUrl }));
      toast({ title: "Bilde lastet opp", description: "Husk å lagre CV-en." });
    } catch (e: any) {
      toast({ title: "Opplasting feilet", description: e?.message ?? "Ukjent feil", variant: "destructive" });
    } finally {
      setUploadingPhoto(false);
    }
  };
  const removePhoto = () => setCv((prev) => ({ ...prev, photo_url: null }));

  if (loading) return <div className="p-8 flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Laster…</div>;

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 lg:p-10 space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center shadow-elevated shrink-0">
            <FileText className="w-5 h-5 text-primary-foreground" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">CV</h1>
            <p className="text-muted-foreground text-sm mt-1">Lag flere CV-varianter (formell, uformell, design, akademisk…). Velg per søknad — eller la AI velge.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportPdf}><Download className="w-4 h-4 mr-2" /> PDF</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Lagre
          </Button>
        </div>
      </header>

      {/* Variant selector */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">CV-varianter</CardTitle>
          <p className="text-xs text-muted-foreground">Bytt mellom varianter, eller opprett en ny for et annet bruksområde.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {variants.map((v) => {
              const isActive = v.id === activeId;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => switchVariant(v.id)}
                  className={`group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm transition-colors ${
                    isActive ? "bg-primary text-primary-foreground border-primary" : "bg-background border-input hover:bg-accent"
                  }`}
                >
                  {v.is_default && <Star className={`w-3 h-3 ${isActive ? "fill-current" : "fill-warning text-warning"}`} />}
                  <span className="font-medium">{v.variant_name || "Standard"}</span>
                  {v.cv_style && (
                    <span className={`text-[10px] uppercase tracking-wide ${isActive ? "opacity-80" : "text-muted-foreground"}`}>
                      {v.cv_style}
                    </span>
                  )}
                </button>
              );
            })}
            <Button variant="outline" size="sm" onClick={createVariant}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Ny variant
            </Button>
          </div>

          {(activeId || variants.length === 0) && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={openRename}>
                <Pencil className="w-3.5 h-3.5 mr-1.5" /> Gi nytt navn
              </Button>
              {activeId && (
                <>
                  <Button variant="outline" size="sm" onClick={duplicateVariant}>
                    <Copy className="w-3.5 h-3.5 mr-1.5" /> Dupliser
                  </Button>
                  {!cv.is_default && (
                    <Button variant="outline" size="sm" onClick={setAsDefault}>
                      <Star className="w-3.5 h-3.5 mr-1.5" /> Sett som standard
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={deleteVariant} disabled={variants.length <= 1}>
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Slett
                  </Button>
                </>
              )}
              {cv.variant_description && (
                <span className="text-xs text-muted-foreground italic ml-1">{cv.variant_description}</span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gi CV-varianten et navn</DialogTitle>
            <DialogDescription>Navnet hjelper deg å skille variantene. Beskrivelsen brukes også av AI når den skal velge variant per søknad.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Navn</Label>
              <Input value={renameDraft.name} onChange={(e) => setRenameDraft({ ...renameDraft, name: e.target.value })} placeholder="f.eks. Formell IT" />
            </div>
            <div className="space-y-1.5">
              <Label>Beskrivelse (valgfri)</Label>
              <Textarea
                rows={3}
                value={renameDraft.description}
                onChange={(e) => setRenameDraft({ ...renameDraft, description: e.target.value })}
                placeholder="Når passer denne best? F.eks. 'Tech/scaleups, vekt på produkt og fullstack.'"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>Avbryt</Button>
            <Button onClick={saveRename} disabled={!renameDraft.name.trim()}>Lagre</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">CV-stil</CardTitle>
          <p className="text-xs text-muted-foreground">Standardstil for CV og matchende søknadsbrev. AI velger automatisk per jobb basert på bransje.</p>
        </CardHeader>
        <CardContent>
          <CvStylePicker value={cv.cv_style} onChange={(id) => setCv({ ...cv, cv_style: id })} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Forhåndsvisning</CardTitle></CardHeader>
        <CardContent>
          <CvPdfPreview cv={cv as any} styleId={cv.cv_style} />
        </CardContent>
      </Card>

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
        <CardContent className="space-y-5">
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-full bg-muted overflow-hidden flex items-center justify-center border">
              {cv.photo_url ? (
                <img src={cv.photo_url} alt="Profilbilde" className="w-full h-full object-cover" />
              ) : (
                <span className="text-xs text-muted-foreground">Ingen</span>
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Profilbilde</Label>
              <div className="flex flex-wrap gap-2">
                <label className={uploadingPhoto ? "pointer-events-none opacity-60" : "cursor-pointer"}>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    disabled={uploadingPhoto}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadPhoto(f);
                      e.target.value = "";
                    }}
                  />
                  <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-input bg-background hover:bg-accent text-sm">
                    {uploadingPhoto ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                    {cv.photo_url ? "Bytt bilde" : "Last opp bilde"}
                  </span>
                </label>
                {cv.photo_url && (
                  <Button variant="ghost" size="sm" onClick={removePhoto}>
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Fjern
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">JPG, PNG eller WebP. Maks 5 MB. Vises øverst på CV.</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Fullt navn" value={cv.full_name ?? ""} onChange={(v) => setCv({ ...cv, full_name: v })} />
            <Field label="Tittel/headline" value={cv.headline ?? ""} onChange={(v) => setCv({ ...cv, headline: v })} placeholder="f.eks. Senior systemutvikler" />
            <Field label="Epost" value={cv.email ?? ""} onChange={(v) => setCv({ ...cv, email: v })} />
            <Field label="Telefon" value={cv.phone ?? ""} onChange={(v) => setCv({ ...cv, phone: v })} />
            <Field label="Sted" value={cv.location ?? ""} onChange={(v) => setCv({ ...cv, location: v })} />
            <Field label="LinkedIn" value={cv.linkedin_url ?? ""} onChange={(v) => setCv({ ...cv, linkedin_url: v })} />
            <Field label="Nettsted" value={cv.website_url ?? ""} onChange={(v) => setCv({ ...cv, website_url: v })} />
          </div>
        </CardContent>
      </Card>

      {/* Intro */}
      <Card>
        <CardHeader><CardTitle className="text-base">Introduksjon</CardTitle><p className="text-xs text-muted-foreground">Generell elevator pitch (AI tilpasser per søknad).</p></CardHeader>
        <CardContent>
          <Textarea rows={4} value={cv.intro} onChange={(e) => setCv({ ...cv, intro: e.target.value })} placeholder="Kort om deg, sentrale styrker, hva du leter etter…" />
        </CardContent>
      </Card>

      {/* Section order */}
      <SectionOrderCard
        order={cv.section_order}
        onChange={(o) => setCv({ ...cv, section_order: o })}
      />

      {/* Dynamic sections in user-defined order */}
      {cv.section_order.map((key) => renderEditorSection(key, cv, setCv))}
    </div>
  );
};

/* ---------- Section order card ---------- */

const SectionOrderCard = ({
  order,
  onChange,
}: {
  order: CvSectionKey[];
  onChange: (next: CvSectionKey[]) => void;
}) => {
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length) return;
    const next = [...order];
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it);
    onChange(next);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Rekkefølge på avsnitt</CardTitle>
        <p className="text-xs text-muted-foreground">
          Dra for å endre rekkefølgen — eller bruk pilene. Påvirker både forhåndsvisning og PDF.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-1.5">
          {order.map((key, i) => (
            <li
              key={key}
              draggable
              onDragStart={() => setDragIdx(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIdx === null || dragIdx === i) return;
                move(dragIdx, i);
                setDragIdx(null);
              }}
              onDragEnd={() => setDragIdx(null)}
              className={`flex items-center gap-2 px-3 py-2 rounded-md border bg-background transition-colors ${
                dragIdx === i ? "opacity-50 border-primary" : "hover:bg-accent"
              }`}
            >
              <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />
              <span className="flex-1 text-sm font-medium">{i + 1}. {SECTION_LABELS[key]}</span>
              <Button variant="ghost" size="icon" className="h-7 w-7" disabled={i === 0} onClick={() => move(i, i - 1)} aria-label="Flytt opp">
                <ArrowUp className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" disabled={i === order.length - 1} onClick={() => move(i, i + 1)} aria-label="Flytt ned">
                <ArrowDown className="w-3.5 h-3.5" />
              </Button>
            </li>
          ))}
        </ul>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange([...DEFAULT_SECTION_ORDER])}
          disabled={order.every((k, i) => k === DEFAULT_SECTION_ORDER[i])}
        >
          <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Tilbakestill rekkefølge
        </Button>
      </CardContent>
    </Card>
  );
};

/* ---------- Per-section editor renderer ---------- */

function renderEditorSection(
  key: CvSectionKey,
  cv: CV,
  setCv: (c: CV) => void,
): React.ReactNode {
  switch (key) {
    case "experiences":
      return (
        <SectionList
          key={key}
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
      );
    case "education":
      return (
        <SectionList
          key={key}
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
      );
    case "skills":
      return (
        <SectionList
          key={key}
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
      );
    case "languages":
      return (
        <SectionList
          key={key}
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
      );
    case "projects":
      return (
        <SectionList
          key={key}
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
      );
    case "certifications":
      return (
        <SectionList
          key={key}
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
      );
    default:
      return null;
  }
}

const Field = ({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) => (
  <div className="space-y-2">
    <Label>{label}</Label>
    <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
  </div>
);

const ChipList = ({ label, items, onChange }: { label: string; items: string[]; onChange: (v: string[]) => void }) => {
  const [input, setInput] = useState("");
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const add = () => { if (!input.trim()) return; onChange([...items, input.trim()]); setInput(""); };
  const move = (from: number, to: number) => {
    const next = moveArrayItem(items, from, to);
    if (next !== items) onChange(next);
  };
  return (
    <div className="space-y-2 mt-3">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it, i) => (
          <span
            key={`${it}-${i}`}
            draggable
            onDragStart={() => setDragIdx(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (dragIdx !== null) move(dragIdx, i);
              setDragIdx(null);
            }}
            onDragEnd={() => setDragIdx(null)}
            className={`inline-flex items-center gap-1 rounded-md bg-accent px-1 py-0.5 text-xs text-accent-foreground transition-colors ${
              dragIdx === i ? "opacity-50 ring-1 ring-primary" : ""
            }`}
          >
            <GripVertical className="h-3 w-3 shrink-0 cursor-grab text-muted-foreground" />
            <span className="px-1">{it}</span>
            <button
              type="button"
              disabled={i === 0}
              onClick={() => move(i, i - 1)}
              className="inline-flex h-5 w-5 items-center justify-center rounded hover:bg-background/70 disabled:pointer-events-none disabled:opacity-35"
              aria-label="Flytt opp"
            >
              <ArrowUp className="h-3 w-3" />
            </button>
            <button
              type="button"
              disabled={i === items.length - 1}
              onClick={() => move(i, i + 1)}
              className="inline-flex h-5 w-5 items-center justify-center rounded hover:bg-background/70 disabled:pointer-events-none disabled:opacity-35"
              aria-label="Flytt ned"
            >
              <ArrowDown className="h-3 w-3" />
            </button>
            <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} className="inline-flex h-5 w-5 items-center justify-center rounded hover:bg-background/70 hover:text-destructive" aria-label="Fjern">
              ×
            </button>
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
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const move = (from: number, to: number) => {
    const next = moveArrayItem(items, from, to);
    if (next === items) return;
    onChange(next);
    setOpenIdx((current) => {
      if (current === null) return null;
      if (current === from) return to;
      if (from < current && current <= to) return current - 1;
      if (to <= current && current < from) return current + 1;
      return current;
    });
  };

  const remove = (index: number) => {
    onChange(items.filter((_, j) => j !== index));
    setOpenIdx((current) => {
      if (current === null) return null;
      if (current === index) return null;
      return current > index ? current - 1 : current;
    });
  };

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
          <div
            key={i}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (dragIdx !== null) move(dragIdx, i);
              setDragIdx(null);
            }}
            className={`rounded-md border border-border transition-colors ${
              dragIdx === i ? "opacity-50 border-primary" : ""
            }`}
          >
            <div
              draggable
              onDragStart={() => setDragIdx(i)}
              onDragEnd={() => setDragIdx(null)}
              className="flex items-center justify-between p-3 cursor-pointer hover:bg-accent/30"
              onClick={() => setOpenIdx(openIdx === i ? null : i)}
            >
              <div className="flex items-center gap-2 min-w-0">
                <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />
                <span className="text-sm truncate">{labelKey(item)}</span>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={i === 0} onClick={(e) => { e.stopPropagation(); move(i, i - 1); }} aria-label="Flytt opp">
                  <ArrowUp className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={i === items.length - 1} onClick={(e) => { e.stopPropagation(); move(i, i + 1); }} aria-label="Flytt ned">
                  <ArrowDown className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); remove(i); }}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
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
