import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, Save, Send, Trash2, Sparkles, FileText, Download } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { LetterDocument } from "@/components/cv/LetterDocument";
import { CvDocument } from "@/components/cv/CvDocument";
import { CvStylePicker } from "@/components/cv/CvStylePicker";
import { SheetViewer } from "@/components/cv/SheetViewer";
import { exportNodeToPdf } from "@/components/cv/exportPdf";
import { CvStyleId } from "@/components/cv/cvStyles";
import { ApplicationChatEditor } from "@/components/cv/ApplicationChatEditor";
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
  const [text, setText] = useState("");
  const [preview, setPreview] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tailoring, setTailoring] = useState(false);
  const [selection, setSelection] = useState("");
  const letterRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const cvRef = useRef<HTMLDivElement>(null);

  useEffect(() => { load(); }, [id]);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const [{ data: a }, { data: t }] = await Promise.all([
      supabase.from("applications").select("*, jobs(*)").eq("id", id).maybeSingle(),
      supabase.from("application_cv_tweaks").select("*").eq("application_id", id).maybeSingle(),
    ]);
    setApp(a); setTweak(t); setText(a?.generated_text ?? "");
    if (a?.user_id) {
      const { data: c } = await supabase.from("cv_templates").select("*").eq("user_id", a.user_id).eq("is_active", true).maybeSingle();
      setCvTpl(c);
    }
    setLoading(false);
  };

  const styleId: CvStyleId = (app?.cv_style ?? cvTpl?.cv_style ?? "skandinavisk") as CvStyleId;
  const setStyle = async (id: CvStyleId) => {
    setApp({ ...app, cv_style: id });
    await supabase.from("applications").update({ cv_style: id }).eq("id", app.id);
  };
  const exportLetterPdf = async () => {
    if (!letterRef.current) return;
    await exportNodeToPdf(letterRef.current, `Soknad-${app?.jobs?.company || "selskap"}.pdf`);
  };
  const exportCvPdf = async () => {
    if (!cvRef.current) return;
    await exportNodeToPdf(cvRef.current, `CV-${cvTpl?.full_name || "uten-navn"}.pdf`);
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

      <Tabs defaultValue="letter">
        <TabsList>
          <TabsTrigger value="letter"><FileText className="w-3.5 h-3.5 mr-1.5" /> Søknadsbrev</TabsTrigger>
          <TabsTrigger value="cv"><Sparkles className="w-3.5 h-3.5 mr-1.5" /> Tilpasset CV {tweak && "✓"}</TabsTrigger>
        </TabsList>

        <TabsContent value="letter" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">CV-stil (matcher søknadsbrevet)</CardTitle>
              <p className="text-xs text-muted-foreground">AI valgte stilen automatisk – endre om du vil.</p>
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
                <Button variant="outline" size="sm" onClick={exportLetterPdf}><Download className="w-4 h-4 mr-2" /> PDF</Button>
                <Button size="sm" onClick={save} disabled={saving}><Save className="w-4 h-4 mr-2" /> Lagre</Button>
                {app.status === "draft" && <Button size="sm" onClick={() => setStatus("sent")}><Send className="w-4 h-4 mr-2" /> Marker som sendt</Button>}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-4">
                <div className="min-w-0">
                  {preview ? (
                    <SheetViewer>
                      <div ref={letterRef}>
                        <LetterDocument
                          cv={cvTpl ?? {}}
                          text={text}
                          jobTitle={app.jobs?.title}
                          company={app.jobs?.company}
                          styleId={styleId}
                        />
                      </div>
                    </SheetViewer>
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
                <div className="min-w-0 xl:sticky xl:top-4 xl:self-start">
                  <ApplicationChatEditor
                    applicationId={app.id}
                    text={text}
                    onTextChange={setText}
                    selection={selection}
                    onClearSelection={() => setSelection("")}
                    jobTitle={app.jobs?.title}
                    company={app.jobs?.company}
                    jobDescription={app.jobs?.description}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {cvTpl && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">CV (samme stil)</CardTitle>
                <Button variant="outline" size="sm" onClick={exportCvPdf}><Download className="w-4 h-4 mr-2" /> PDF</Button>
              </CardHeader>
              <CardContent>
                <SheetViewer>
                  <div ref={cvRef}><CvDocument cv={cvTpl} styleId={styleId} /></div>
                </SheetViewer>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="cv" className="space-y-4 mt-4">
          {!tweak ? (
            <Card><CardContent className="p-8 text-center space-y-4">
              <p className="text-sm text-muted-foreground">Ingen CV-tilpasning ennå. AI bruker CV-malen din og foreslår endringer skreddersydd til denne stillingen.</p>
              <Button onClick={tailorCv} disabled={tailoring}>
                {tailoring ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> AI tilpasser…</> : <><Sparkles className="w-4 h-4 mr-2" /> Tilpass CV</>}
              </Button>
            </CardContent></Card>
          ) : (
            <>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base">AI-anbefalinger</CardTitle>
                  <Button variant="outline" size="sm" onClick={tailorCv} disabled={tailoring}>
                    {tailoring ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />} Generer på nytt
                  </Button>
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
              {tweak.tailored_cv_markdown && (
                <Card>
                  <CardHeader><CardTitle className="text-base">Komplett tilpasset CV</CardTitle></CardHeader>
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
