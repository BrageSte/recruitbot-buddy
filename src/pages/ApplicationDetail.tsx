import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, ArrowLeft, CheckCircle2, Clock3, Download, FileText, History, Loader2, PanelRightClose, PanelRightOpen, Paperclip, RefreshCw, Save, Send, Sparkles, Trash2, Undo2, Upload } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CvStylePicker } from "@/components/cv/CvStylePicker";
import { DeferredCvPdfPreview, DeferredLetterPdfPreview } from "@/components/cv/pdf/DeferredPdfPreview";
import { CvStyleId } from "@/components/cv/cvStyles";
import { ApplicationChatEditor } from "@/components/cv/ApplicationChatEditor";
import { CvTailoringChatEditor } from "@/components/cv/CvTailoringChatEditor";
import { JobContextCard } from "@/components/JobContextCard";

const STATUSES = [
  { v: "draft", label: "Utkast" }, { v: "sent", label: "Sendt" },
  { v: "response_received", label: "Svar mottatt" }, { v: "interview", label: "Intervju" },
  { v: "offer", label: "Tilbud" }, { v: "rejected", label: "Avslag" }, { v: "withdrawn", label: "Trukket" },
];

type ApplicationAttachment = {
  id: string;
  user_id: string;
  application_id: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  extracted_text: string | null;
  ai_summary: string | null;
  extraction_status: "uploaded" | "extracting" | "ready" | "failed" | string;
  extraction_error: string | null;
  created_at: string;
  updated_at: string;
};

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const isSupportedAttachment = (file: File) => {
  const name = file.name.toLowerCase();
  return (
    file.type === "application/pdf"
    || file.type.startsWith("text/")
    || name.endsWith(".pdf")
    || name.endsWith(".txt")
    || name.endsWith(".md")
    || name.endsWith(".markdown")
  );
};

const sanitizeStorageName = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    || "vedlegg";

const formatBytes = (value: number | null | undefined) => {
  if (!value) return "";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

const AttachmentStatus = ({ status }: { status: string }) => {
  if (status === "ready") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="h-3 w-3" /> Klar
      </span>
    );
  }

  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
        <AlertCircle className="h-3 w-3" /> Feilet
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
      {status === "extracting" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Clock3 className="h-3 w-3" />}
      Behandler
    </span>
  );
};

const ApplicationDetail = () => {
  const { id } = useParams();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [app, setApp] = useState<any>(null);
  const [tweak, setTweak] = useState<any>(null);
  const [cvTpl, setCvTpl] = useState<any>(null);
  const [allCvs, setAllCvs] = useState<any[]>([]);
  const [revisions, setRevisions] = useState<any[]>([]);
  const [attachments, setAttachments] = useState<ApplicationAttachment[]>([]);
  const [selectedAttachmentIds, setSelectedAttachmentIds] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [preview, setPreview] = useState(true);
  const [activeTab, setActiveTab] = useState("letter");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exportingPdf, setExportingPdf] = useState<"letter" | "cv" | null>(null);
  const [tailoring, setTailoring] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [applyingAttachments, setApplyingAttachments] = useState<"letter" | "cv" | "both" | null>(null);
  const [attachmentInstruction, setAttachmentInstruction] = useState("");
  const [selection, setSelection] = useState("");
  const [regenerateInstruction, setRegenerateInstruction] = useState("");
  const [regenerating, setRegenerating] = useState(false);
  const [showTextTools, setShowTextTools] = useState(true);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [{ data: a }, { data: t }, { data: r }, { data: at }] = await Promise.all([
      supabase.from("applications").select("*, jobs(*)").eq("id", id).maybeSingle(),
      supabase.from("application_cv_tweaks").select("*").eq("application_id", id).maybeSingle(),
      (supabase as any)
        .from("application_revisions")
        .select("id, instruction, source, previous_text, next_text, created_at")
        .eq("application_id", id)
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("application_attachments")
        .select("*")
        .eq("application_id", id)
        .order("created_at", { ascending: false }),
    ]);
    setApp(a); setTweak(t); setText(a?.generated_text ?? "");
    setRevisions(r ?? []);
    setAttachments((at ?? []) as ApplicationAttachment[]);
    setSelectedAttachmentIds((ids) => ids.filter((attachmentId) => (at ?? []).some((item: any) => item.id === attachmentId)));
    if (a?.user_id) {
      let cv: any = null;
      if ((a as any).cv_template_id) {
        const { data } = await supabase.from("cv_templates").select("*").eq("id", (a as any).cv_template_id).maybeSingle();
        cv = data;
      }
      if (!cv) {
        const { data } = await supabase
          .from("cv_templates")
          .select("*")
          .eq("user_id", a.user_id)
          .order("is_default", { ascending: false })
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        cv = data;
      }
      setCvTpl(cv);
      const { data: cvs } = await supabase
        .from("cv_templates")
        .select("id, variant_name, variant_description, cv_style, is_default")
        .eq("user_id", a.user_id)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true });
      setAllCvs(cvs ?? []);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const refreshAttachments = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from("application_attachments")
      .select("*")
      .eq("application_id", id)
      .order("created_at", { ascending: false });
    const next = (data ?? []) as ApplicationAttachment[];
    setAttachments(next);
    setSelectedAttachmentIds((ids) => ids.filter((attachmentId) => next.some((item) => item.id === attachmentId)));
  }, [id]);

  const refreshRevisions = async () => {
    if (!id) return;
    const { data } = await (supabase as any)
      .from("application_revisions")
      .select("id, instruction, source, previous_text, next_text, created_at")
      .eq("application_id", id)
      .order("created_at", { ascending: false })
      .limit(8);
    setRevisions(data ?? []);
  };

  const uploadAttachment = async (file: File | undefined) => {
    if (!file || !app) return;
    if (!isSupportedAttachment(file)) {
      toast({ title: "Ustøttet filtype", description: "V1 støtter PDF, TXT og Markdown.", variant: "destructive" });
      return;
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      toast({ title: "For stor fil", description: "Maks 10 MB.", variant: "destructive" });
      return;
    }

    setUploadingAttachment(true);
    try {
      const path = `${app.user_id}/applications/${app.id}/${Date.now()}-${sanitizeStorageName(file.name)}`;
      const { error: uploadError } = await supabase.storage.from("user-files").upload(path, file, {
        contentType: file.type || undefined,
      });
      if (uploadError) throw uploadError;

      const { data: inserted, error: insertError } = await supabase
        .from("application_attachments")
        .insert({
          user_id: app.user_id,
          application_id: app.id,
          file_name: file.name,
          storage_path: path,
          mime_type: file.type || null,
          size_bytes: file.size,
          extraction_status: "uploaded",
        })
        .select()
        .maybeSingle();
      if (insertError) throw insertError;

      if (inserted) {
        setAttachments((items) => [inserted as ApplicationAttachment, ...items]);
        const { error: extractError } = await supabase.functions.invoke("extract-application-attachment", {
          body: { attachmentId: inserted.id },
        });
        if (extractError) throw extractError;
      }

      toast({ title: "Vedlegg klart", description: "Filen kan brukes som AI-kontekst." });
    } catch (e: any) {
      toast({ title: "Kunne ikke behandle vedlegg", description: e.message, variant: "destructive" });
    } finally {
      setUploadingAttachment(false);
      await refreshAttachments();
    }
  };

  const deleteAttachment = async (attachment: ApplicationAttachment) => {
    if (!confirm(`Slette "${attachment.file_name}"?`)) return;
    await supabase.storage.from("user-files").remove([attachment.storage_path]);
    const { error } = await supabase.from("application_attachments").delete().eq("id", attachment.id);
    if (error) {
      toast({ title: "Kunne ikke slette vedlegg", description: error.message, variant: "destructive" });
      return;
    }
    setAttachments((items) => items.filter((item) => item.id !== attachment.id));
    setSelectedAttachmentIds((ids) => ids.filter((id) => id !== attachment.id));
  };

  const applySelectedAttachments = async (target: "letter" | "cv") => {
    if (!app) return;
    const readyIds = selectedAttachmentIds.filter((attachmentId) => {
      const attachment = attachments.find((item) => item.id === attachmentId);
      return attachment?.extraction_status === "ready" && attachment.extracted_text?.trim();
    });
    if (readyIds.length === 0) {
      toast({ title: "Velg AI-klare vedlegg først", variant: "destructive" });
      return;
    }

    setApplyingAttachments(target);
    try {
      const { data, error } = await supabase.functions.invoke("apply-application-attachments", {
        body: {
          applicationId: app.id,
          attachmentIds: readyIds,
          target,
          instruction: attachmentInstruction,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      if (target === "letter" && (data as any)?.generatedText) {
        const nextText = (data as any).generatedText;
        setText(nextText);
        setApp({ ...app, generated_text: nextText });
        await refreshRevisions();
        setActiveTab("letter");
      }
      if (target === "cv" && (data as any)?.tweak) {
        setTweak((data as any).tweak);
        setActiveTab("cv");
      }

      setAttachmentInstruction("");
      toast({
        title: target === "letter" ? "Vedlegg flettet inn i søknadsbrevet" : "Vedlegg flettet inn i CV-en",
      });
    } catch (e: any) {
      toast({ title: "Fletting feilet", description: e.message, variant: "destructive" });
    } finally {
      setApplyingAttachments(null);
    }
  };

  const styleId: CvStyleId = (app?.cv_style ?? cvTpl?.cv_style ?? "skandinavisk") as CvStyleId;
  const setStyle = async (id: CvStyleId) => {
    setApp({ ...app, cv_style: id });
    await supabase.from("applications").update({ cv_style: id }).eq("id", app.id);
  };
  const setCvVariant = async (cvTemplateId: string) => {
    await supabase.from("applications").update({ cv_template_id: cvTemplateId } as any).eq("id", app.id);
    const { data: cv } = await supabase.from("cv_templates").select("*").eq("id", cvTemplateId).maybeSingle();
    setCvTpl(cv);
    setApp({ ...app, cv_template_id: cvTemplateId, cv_style: (cv as any)?.cv_style ?? app.cv_style });
    toast({ title: "CV byttet", description: (cv as any)?.variant_name ?? "" });
  };

  // The CV that should be rendered in previews/PDFs.
  // If a tailored snapshot exists, use it; otherwise fall back to the template.
  const effectiveCv = tweak?.tailored_cv
    ? { ...cvTpl, ...tweak.tailored_cv, section_order: tweak.section_order ?? tweak.tailored_cv.section_order ?? cvTpl?.section_order }
    : cvTpl;
  const isTailored = !!tweak?.tailored_cv;
  const readySelectedCount = selectedAttachmentIds.filter((attachmentId) => {
    const attachment = attachments.find((item) => item.id === attachmentId);
    return attachment?.extraction_status === "ready" && attachment.extracted_text?.trim();
  }).length;

  const exportLetterPdf = async () => {
    setExportingPdf("letter");
    try {
      const [{ downloadPdfDocument }, { LetterPdfDocument }] = await Promise.all([
        import("@/components/cv/exportPdf"),
        import("@/components/cv/pdf/LetterPdfDocument"),
      ]);
      await downloadPdfDocument(
        <LetterPdfDocument
          cv={cvTpl ?? {}}
          text={text}
          jobTitle={app?.jobs?.title}
          company={app?.jobs?.company}
          styleId={styleId}
        />,
        `Soknad-${app?.jobs?.company || "selskap"}.pdf`
      );
    } finally {
      setExportingPdf(null);
    }
  };
  const exportCvPdf = async () => {
    if (!effectiveCv) return;
    setExportingPdf("cv");
    try {
      const [{ downloadPdfDocument }, { CvPdfDocument }] = await Promise.all([
        import("@/components/cv/exportPdf"),
        import("@/components/cv/pdf/CvPdfDocument"),
      ]);
      await downloadPdfDocument(
        <CvPdfDocument cv={effectiveCv} styleId={styleId} />,
        `CV-${cvTpl?.full_name || "uten-navn"}.pdf`
      );
    } finally {
      setExportingPdf(null);
    }
  };


  const save = async () => {
    setSaving(true);
    await supabase.from("applications").update({ generated_text: text }).eq("id", app.id);
    setSaving(false); toast({ title: "Lagret" });
  };

  const setStatus = async (status: string) => {
    const upd: any = { status };
    if (status === "sent" && !app.sent_at) upd.sent_at = new Date().toISOString();
    await supabase.from("applications").update(upd).eq("id", app.id);
    if (status === "sent") {
      await supabase.from("jobs").update({ status: "applied" as any }).eq("id", app.job_id);
      await supabase.from("application_events").insert({ user_id: app.user_id, application_id: app.id, event_type: "sent", description: "Søknad sendt" });
    }
    load();
  };

  const tailorCv = async () => {
    setTailoring(true);
    try {
      const { data, error } = await supabase.functions.invoke("tailor-cv", { body: { applicationId: app.id } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast({ title: "CV tilpasset" }); load();
    } catch (e: any) { toast({ title: "Feilet", description: e.message, variant: "destructive" }); }
    finally { setTailoring(false); }
  };

  const regenerateApplication = async () => {
    if (!app) return;
    setRegenerating(true);
    try {
      const { error } = await supabase.functions.invoke("generate-application", {
        body: {
          applicationId: app.id,
          instruction: regenerateInstruction || "Lag et nytt, mer konkret og arbeidsgiverrettet utkast.",
          cvTemplateId: (app as any).cv_template_id ?? cvTpl?.id ?? undefined,
        },
      });
      if (error) throw error;
      toast({ title: "Nytt forslag klart", description: "Forrige versjon er lagret i revisjonshistorikken." });
      setRegenerateInstruction("");
      await load();
    } catch (e: any) {
      toast({ title: "Kunne ikke lage nytt forslag", description: e.message, variant: "destructive" });
    } finally {
      setRegenerating(false);
    }
  };

  const restoreRevision = async (revision: any) => {
    if (!app) return;
    const previousText = String(revision.previous_text ?? "");
    if (!previousText.trim()) return;
    await supabase.from("applications").update({ generated_text: previousText }).eq("id", app.id);
    setText(previousText);
    setApp({ ...app, generated_text: previousText });
    toast({ title: "Tidligere versjon gjenopprettet" });
    await load();
  };

  const resetTailoredCv = async () => {
    if (!confirm("Bruk original CV-mal igjen? Snapshotet av tilpasset CV slettes (anbefalingene beholdes ikke).")) return;
    await supabase.from("application_cv_tweaks").delete().eq("application_id", app.id);
    setTweak(null);
    toast({ title: "Tilbake til original mal" });
  };

  const remove = async () => {
    if (!confirm("Slett søknaden?")) return;
    await supabase.from("applications").delete().eq("id", app.id);
    navigate("/applications");
  };

  if (loading) return <div className="p-8 flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Laster…</div>;
  if (!app) return <div className="p-8">Søknad ikke funnet.</div>;

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 lg:p-10 space-y-6">
      <Link to="/applications" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" /> Tilbake
      </Link>

      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{app.jobs?.title}</h1>
          <p className="text-muted-foreground">{app.jobs?.company}</p>
        </div>
        <div className="flex gap-2">
          <select value={app.status} onChange={(e) => setStatus(e.target.value)} className="text-sm border border-input rounded-md px-3 py-2 bg-background">
            {STATUSES.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
          </select>
          <Button variant="outline" size="icon" onClick={remove}><Trash2 className="w-4 h-4" /></Button>
        </div>
      </header>

      {app.jobs && <JobContextCard job={app.jobs} />}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="letter"><FileText className="w-3.5 h-3.5 mr-1.5" /> Søknadsbrev</TabsTrigger>
          <TabsTrigger value="cv"><Sparkles className="w-3.5 h-3.5 mr-1.5" /> Tilpasset CV {tweak && "✓"}</TabsTrigger>
          <TabsTrigger value="attachments"><Paperclip className="w-3.5 h-3.5 mr-1.5" /> Vedlegg {attachments.length > 0 && `(${attachments.length})`}</TabsTrigger>
        </TabsList>

        <TabsContent value="letter" className="space-y-4 mt-4">
          {allCvs.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">CV-variant</CardTitle>
                <p className="text-xs text-muted-foreground">Hvilken CV som ble brukt for denne søknaden. Bytt for å bruke en annen variant.</p>
              </CardHeader>
              <CardContent>
                <select
                  value={(app as any).cv_template_id ?? cvTpl?.id ?? ""}
                  onChange={(e) => setCvVariant(e.target.value)}
                  className="text-sm border border-input rounded-md px-3 py-2 bg-background w-full max-w-md"
                >
                  {allCvs.map((v: any) => (
                    <option key={v.id} value={v.id}>
                      {v.variant_name || "Standard"}
                      {v.is_default ? " (standard)" : ""}
                      {v.cv_style ? ` · ${v.cv_style}` : ""}
                    </option>
                  ))}
                </select>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">CV-stil (matcher søknadsbrevet)</CardTitle>
              <p className="text-xs text-muted-foreground">Stilen ble valgt automatisk – endre om du vil.</p>
            </CardHeader>
            <CardContent>
              <CvStylePicker value={styleId} onChange={setStyle} size="sm" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1.5">
                <CardTitle className="text-base leading-6">Søknadsbrev</CardTitle>
                <CardDescription className="text-xs">Samme visuelle stil som valgt CV</CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <Button variant="outline" size="sm" onClick={() => setPreview(!preview)}>{preview ? "Rediger" : "Forhåndsvis"}</Button>
                <Button variant="outline" size="sm" onClick={() => setShowTextTools((value) => !value)}>
                  {showTextTools ? <PanelRightClose className="w-4 h-4 mr-2" /> : <PanelRightOpen className="w-4 h-4 mr-2" />}
                  Tekstverktøy
                </Button>
                <Button variant="outline" size="sm" onClick={exportLetterPdf} disabled={exportingPdf !== null}>
                  {exportingPdf === "letter" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                  PDF
                </Button>
                <Button size="sm" onClick={save} disabled={saving}><Save className="w-4 h-4 mr-2" /> Lagre</Button>
                {app.status === "draft" && <Button size="sm" onClick={() => setStatus("sent")}><Send className="w-4 h-4 mr-2" /> Marker som sendt</Button>}
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
                <div className="text-sm font-medium">Lag nytt forslag</div>
                <div className="flex flex-col gap-3 md:flex-row">
                  <Textarea
                    rows={2}
                    value={regenerateInstruction}
                    onChange={(e) => setRegenerateInstruction(e.target.value)}
                    placeholder="f.eks. mer konkret på hva dere får med meg, mindre formell, kortere åpning..."
                    disabled={regenerating}
                    className="min-h-[72px] resize-none bg-background"
                  />
                  <Button onClick={regenerateApplication} disabled={regenerating} className="shrink-0 md:w-44">
                    {regenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                    Lag nytt
                  </Button>
                </div>
                {revisions.length > 0 && (
                  <div className="border-t border-border/70 pt-3 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <History className="w-3.5 h-3.5" />
                      Revisjonshistorikk
                    </div>
                    <div className="space-y-1.5">
                      {revisions.slice(0, 4).map((revision) => (
                        <div key={revision.id} className="flex items-center justify-between gap-3 rounded-md bg-background/80 px-3 py-2">
                          <div className="min-w-0">
                            <div className="text-xs font-medium truncate">
                              {revision.instruction || (revision.source === "edit" ? "Tekstverktøy" : "Nytt forslag")}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {new Date(revision.created_at).toLocaleString("nb-NO", { dateStyle: "short", timeStyle: "short" })}
                            </div>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => restoreRevision(revision)} className="shrink-0">
                            <Undo2 className="w-3.5 h-3.5 mr-1.5" />
                            Gjenopprett
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className={`grid grid-cols-1 gap-5 ${showTextTools ? "xl:grid-cols-[minmax(0,1fr)_340px]" : ""}`}>
                <div className="min-w-0">
                  {preview ? (
                    <DeferredLetterPdfPreview
                      cv={cvTpl ?? {}}
                      text={text}
                      jobTitle={app.jobs?.title}
                      company={app.jobs?.company}
                      styleId={styleId}
                    />
                  ) : (
                    <Textarea
                      ref={editorRef}
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      onSelect={(e) => {
                        const el = e.currentTarget;
                        const sel = el.value.substring(el.selectionStart, el.selectionEnd);
                        setSelection(sel);
                      }}
                      onBlur={(e) => {
                        const el = e.currentTarget;
                        const sel = el.value.substring(el.selectionStart, el.selectionEnd);
                        if (sel.length < 3) setSelection("");
                      }}
                      rows={20}
                      className="font-mono text-sm"
                    />
                  )}
                </div>
                {showTextTools && (
                  <div className="min-w-0 xl:sticky xl:top-4 xl:self-start">
                    <ApplicationChatEditor
                      applicationId={app.id}
                      userId={app.user_id}
                      text={text}
                      onTextChange={setText}
                      selection={selection}
                      onClearSelection={() => setSelection("")}
                      jobTitle={app.jobs?.title}
                      company={app.jobs?.company}
                      jobDescription={app.jobs?.description}
                      onRevisionCreated={refreshRevisions}
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {effectiveCv && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div className="space-y-1">
                  <CardTitle className="text-base flex items-center gap-2">
                    CV (samme stil)
                    {isTailored && (
                      <span className="inline-flex items-center gap-1 text-xs font-normal px-2 py-0.5 bg-primary/15 text-primary rounded">
                        <Sparkles className="w-3 h-3" /> Tilpasset
                      </span>
                    )}
                  </CardTitle>
                  {isTailored && (
                    <p className="text-xs text-muted-foreground">
                      Snapshot av CV omstrukturert for denne stillingen. Eksporten bruker denne versjonen.
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  {isTailored && (
                    <Button variant="ghost" size="sm" onClick={resetTailoredCv}>Bruk original</Button>
                  )}
                  <Button variant="outline" size="sm" onClick={exportCvPdf} disabled={exportingPdf !== null}>
                    {exportingPdf === "cv" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                    PDF
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <DeferredCvPdfPreview cv={effectiveCv} styleId={styleId} />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="cv" className="space-y-4 mt-4">
          {!tweak ? (
            <Card><CardContent className="p-8 text-center space-y-4">
              <p className="text-sm text-muted-foreground">Ingen CV-tilpasning ennå. Jobbhjelpen bruker CV-malen din og foreslår endringer skreddersydd til denne stillingen.</p>
              <Button onClick={tailorCv} disabled={tailoring}>
                {tailoring ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Tilpasser…</> : <><Sparkles className="w-4 h-4 mr-2" /> Tilpass CV</>}
              </Button>
            </CardContent></Card>
          ) : (
            <>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <div className="space-y-1">
                    <CardTitle className="text-base">Anbefalinger</CardTitle>
                    {isTailored && (
                      <p className="text-xs text-muted-foreground">
                        Snapshot av tilpasset CV er aktivt og brukes ved eksport.
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {isTailored && (
                      <Button variant="ghost" size="sm" onClick={resetTailoredCv}>Bruk original mal</Button>
                    )}
                    <Button variant="outline" size="sm" onClick={tailorCv} disabled={tailoring}>
                      {tailoring ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />} Generer på nytt
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {tweak.tailored_intro && (
                    <div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Tilpasset intro</div>
                      <div className="p-3 bg-accent/40 rounded-md text-sm">{tweak.tailored_intro}</div>
                    </div>
                  )}
                  {tweak.highlight_experiences?.length > 0 && (
                    <div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Fremhev disse</div>
                      <div className="flex flex-wrap gap-1.5">{tweak.highlight_experiences.map((e: string, i: number) => <span key={i} className="px-2 py-0.5 bg-success/15 text-success rounded text-xs">{e}</span>)}</div>
                    </div>
                  )}
                  {tweak.deemphasize?.length > 0 && (
                    <div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Ton ned</div>
                      <div className="flex flex-wrap gap-1.5">{tweak.deemphasize.map((e: string, i: number) => <span key={i} className="px-2 py-0.5 bg-muted text-muted-foreground rounded text-xs">{e}</span>)}</div>
                    </div>
                  )}
                  {tweak.prioritize_skills?.length > 0 && (
                    <div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Prioriter ferdigheter</div>
                      <div className="flex flex-wrap gap-1.5">{tweak.prioritize_skills.map((e: string, i: number) => <span key={i} className="px-2 py-0.5 bg-primary/15 text-primary rounded text-xs">{e}</span>)}</div>
                    </div>
                  )}
                  {tweak.section_order?.length > 0 && (
                    <div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Foreslått rekkefølge</div>
                      <div className="flex flex-wrap gap-1.5">{tweak.section_order.map((e: string, i: number) => <span key={i} className="px-2 py-0.5 bg-muted rounded text-xs">{i + 1}. {e}</span>)}</div>
                    </div>
                  )}
                  {tweak.rephrase_suggestions?.length > 0 && (
                    <div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Omformuleringer</div>
                      <div className="space-y-2">
                        {tweak.rephrase_suggestions.map((r: any, i: number) => (
                          <div key={i} className="border border-border rounded-md p-3 text-sm">
                            <div className="text-xs text-muted-foreground mb-1.5">{r.context}</div>
                            <div className="line-through text-muted-foreground text-xs mb-1">{r.before}</div>
                            <div>{r.after}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {tweak.notes && <div className="text-xs text-muted-foreground italic">{tweak.notes}</div>}
                </CardContent>
              </Card>

              {effectiveCv && isTailored && (
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-base">Forhåndsvisning – tilpasset CV</CardTitle>
                    <Button variant="outline" size="sm" onClick={exportCvPdf} disabled={exportingPdf !== null}>
                      {exportingPdf === "cv" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                      PDF
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
                      <div className="min-w-0">
                        <DeferredCvPdfPreview cv={effectiveCv} styleId={styleId} />
                      </div>
                      <div className="min-w-0 xl:sticky xl:top-4 xl:h-[min(80vh,1100px)]">
                        <CvTailoringChatEditor
                          applicationId={app.id}
                          userId={app.user_id}
                          cv={effectiveCv}
                          originalCv={cvTpl}
                          tweak={tweak}
                          onTweakChange={setTweak}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {tweak.tailored_cv_markdown && !isTailored && (
                <Card>
                  <CardHeader><CardTitle className="text-base">Komplett tilpasset CV (markdown)</CardTitle></CardHeader>
                  <CardContent>
                    <div className="prose-app max-w-none border border-border rounded-md p-6 bg-card">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{tweak.tailored_cv_markdown}</ReactMarkdown>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="attachments" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1.5">
                <CardTitle className="text-base">Vedlegg</CardTitle>
                <CardDescription className="text-xs">
                  Last opp filer som bare hører til denne søknaden. AI bruker kun vedleggene du velger her.
                </CardDescription>
              </div>
              <label className={`shrink-0 ${uploadingAttachment ? "pointer-events-none opacity-60" : "cursor-pointer"}`}>
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.txt,.md,.markdown,application/pdf,text/plain,text/markdown"
                  disabled={uploadingAttachment}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    uploadAttachment(file);
                    event.target.value = "";
                  }}
                />
                <span className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent">
                  {uploadingAttachment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Last opp
                </span>
              </label>
            </CardHeader>
            <CardContent className="space-y-5">
              {attachments.length === 0 ? (
                <div className="rounded-md border border-dashed border-border p-8 text-center">
                  <Paperclip className="mx-auto mb-3 h-5 w-5 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Ingen vedlegg på denne søknaden ennå.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {attachments.map((attachment) => {
                    const isReady = attachment.extraction_status === "ready" && !!attachment.extracted_text?.trim();
                    const isSelected = selectedAttachmentIds.includes(attachment.id);
                    return (
                      <div key={attachment.id} className="flex items-start gap-3 rounded-md border border-border bg-card p-3">
                        <Checkbox
                          checked={isSelected}
                          disabled={!isReady}
                          onCheckedChange={(checked) => {
                            setSelectedAttachmentIds((ids) =>
                              checked === true
                                ? [...new Set([...ids, attachment.id])]
                                : ids.filter((id) => id !== attachment.id)
                            );
                          }}
                          className="mt-1"
                          aria-label={`Velg ${attachment.file_name}`}
                        />
                        <FileText className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-sm font-medium">{attachment.file_name}</span>
                            {formatBytes(attachment.size_bytes) && (
                              <span className="text-xs text-muted-foreground">{formatBytes(attachment.size_bytes)}</span>
                            )}
                            <AttachmentStatus status={attachment.extraction_status} />
                          </div>
                          {attachment.ai_summary && (
                            <p className="line-clamp-2 text-xs text-muted-foreground">{attachment.ai_summary}</p>
                          )}
                          {attachment.extraction_error && (
                            <p className="text-xs text-destructive">{attachment.extraction_error}</p>
                          )}
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => deleteAttachment(attachment)} className="shrink-0">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium">Flett inn valgte vedlegg</div>
                    <div className="text-xs text-muted-foreground">
                      {readySelectedCount > 0 ? `${readySelectedCount} AI-klare vedlegg valgt` : "Velg ett eller flere AI-klare vedlegg først"}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => applySelectedAttachments("letter")}
                      disabled={readySelectedCount === 0 || !!applyingAttachments}
                    >
                      {applyingAttachments === "letter" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                      Søknadsbrev
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => applySelectedAttachments("cv")}
                      disabled={readySelectedCount === 0 || !!applyingAttachments}
                    >
                      {applyingAttachments === "cv" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                      CV
                    </Button>
                  </div>
                </div>
                <Textarea
                  rows={2}
                  value={attachmentInstruction}
                  onChange={(event) => setAttachmentInstruction(event.target.value)}
                  placeholder="Valgfritt: f.eks. bruk bare attesten som dokumenterer prosjektledelse, ikke gjenta alt..."
                  className="min-h-[72px] resize-none bg-background"
                  disabled={!!applyingAttachments}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card>
        <CardHeader><CardTitle className="text-base">Notater</CardTitle></CardHeader>
        <CardContent>
          <Textarea rows={4} defaultValue={app.notes ?? ""} onBlur={(e) => supabase.from("applications").update({ notes: e.target.value }).eq("id", app.id)} />
        </CardContent>
      </Card>
    </div>
  );
};

export default ApplicationDetail;
