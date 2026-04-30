import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, Save, Send, Trash2, Sparkles, FileText, Download, PanelRightClose, PanelRightOpen, RefreshCw, History, Undo2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CvStylePicker } from "@/components/cv/CvStylePicker";
import { CvPdfPreview, LetterPdfPreview } from "@/components/cv/pdf/CvPdfPreview";
import { CvPdfDocument } from "@/components/cv/pdf/CvPdfDocument";
import { LetterPdfDocument } from "@/components/cv/pdf/LetterPdfDocument";
import { downloadPdfDocument } from "@/components/cv/exportPdf";
import { CvStyleId } from "@/components/cv/cvStyles";
import { ApplicationChatEditor } from "@/components/cv/ApplicationChatEditor";
import { CvTailoringChatEditor } from "@/components/cv/CvTailoringChatEditor";
import { JobContextCard } from "@/components/JobContextCard";
import { useRef } from "react";

const STATUSES = [
  { v: "draft", label: "Utkast" }, { v: "sent", label: "Sendt" },
  { v: "response_received", label: "Svar mottatt" }, { v: "interview", label: "Intervju" },
  { v: "offer", label: "Tilbud" }, { v: "rejected", label: "Avslag" }, { v: "withdrawn", label: "Trukket" },
];

const ApplicationDetail = () => {
  const { id } = useParams();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [app, setApp] = useState<any>(null);
  const [tweak, setTweak] = useState<any>(null);
  const [cvTpl, setCvTpl] = useState<any>(null);
  const [allCvs, setAllCvs] = useState<any[]>([]);
  const [revisions, setRevisions] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [preview, setPreview] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tailoring, setTailoring] = useState(false);
  const [selection, setSelection] = useState("");
  const [regenerateInstruction, setRegenerateInstruction] = useState("");
  const [regenerating, setRegenerating] = useState(false);
  const [showTextTools, setShowTextTools] = useState(true);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { load(); }, [id]);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const [{ data: a }, { data: t }, { data: r }] = await Promise.all([
      supabase.from("applications").select("*, jobs(*)").eq("id", id).maybeSingle(),
      supabase.from("application_cv_tweaks").select("*").eq("application_id", id).maybeSingle(),
      (supabase as any)
        .from("application_revisions")
        .select("id, instruction, source, previous_text, next_text, created_at")
        .eq("application_id", id)
        .order("created_at", { ascending: false })
        .limit(8),
    ]);
    setApp(a); setTweak(t); setText(a?.generated_text ?? "");
    setRevisions(r ?? []);
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
  };

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

  const exportLetterPdf = async () => {
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
  };
  const exportCvPdf = async () => {
    if (!effectiveCv) return;
    await downloadPdfDocument(
      <CvPdfDocument cv={effectiveCv} styleId={styleId} />,
      `CV-${cvTpl?.full_name || "uten-navn"}.pdf`
    );
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

      <Tabs defaultValue="letter">
        <TabsList>
          <TabsTrigger value="letter"><FileText className="w-3.5 h-3.5 mr-1.5" /> Søknadsbrev</TabsTrigger>
          <TabsTrigger value="cv"><Sparkles className="w-3.5 h-3.5 mr-1.5" /> Tilpasset CV {tweak && "✓"}</TabsTrigger>
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
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Søknadsbrev</CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPreview(!preview)}>{preview ? "Rediger" : "Forhåndsvis"}</Button>
                <Button variant="outline" size="sm" onClick={() => setShowTextTools((value) => !value)}>
                  {showTextTools ? <PanelRightClose className="w-4 h-4 mr-2" /> : <PanelRightOpen className="w-4 h-4 mr-2" />}
                  Tekstverktøy
                </Button>
                <Button variant="outline" size="sm" onClick={exportLetterPdf}><Download className="w-4 h-4 mr-2" /> PDF</Button>
                <Button size="sm" onClick={save} disabled={saving}><Save className="w-4 h-4 mr-2" /> Lagre</Button>
                {app.status === "draft" && <Button size="sm" onClick={() => setStatus("sent")}><Send className="w-4 h-4 mr-2" /> Marker som sendt</Button>}
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border border-border bg-muted/20 p-3 mb-4 space-y-2">
                <div className="text-sm font-medium">Lag nytt forslag</div>
                <div className="flex flex-col md:flex-row gap-2">
                  <Textarea
                    rows={2}
                    value={regenerateInstruction}
                    onChange={(e) => setRegenerateInstruction(e.target.value)}
                    placeholder="f.eks. mer konkret på hva dere får med meg, mindre formell, kortere åpning..."
                    disabled={regenerating}
                  />
                  <Button onClick={regenerateApplication} disabled={regenerating} className="md:w-44 shrink-0">
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

              <div className={`grid grid-cols-1 gap-4 ${showTextTools ? "xl:grid-cols-[minmax(0,1fr)_340px]" : ""}`}>
                <div className="min-w-0">
                  {preview ? (
                    <LetterPdfPreview
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
                  <Button variant="outline" size="sm" onClick={exportCvPdf}><Download className="w-4 h-4 mr-2" /> PDF</Button>
                </div>
              </CardHeader>
              <CardContent>
                <CvPdfPreview cv={effectiveCv} styleId={styleId} />
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
                    <Button variant="outline" size="sm" onClick={exportCvPdf}><Download className="w-4 h-4 mr-2" /> PDF</Button>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
                      <div className="min-w-0">
                        <CvPdfPreview cv={effectiveCv} styleId={styleId} />
                      </div>
                      <div className="min-w-0 xl:sticky xl:top-4 xl:h-[min(80vh,1100px)]">
                        <CvTailoringChatEditor
                          applicationId={app.id}
                          userId={app.user_id}
                          cv={effectiveCv}
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
