import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, Save, Send, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const STATUSES = [
  { v: "draft", label: "Utkast" },
  { v: "sent", label: "Sendt" },
  { v: "response_received", label: "Svar mottatt" },
  { v: "interview", label: "Intervju" },
  { v: "offer", label: "Tilbud" },
  { v: "rejected", label: "Avslag" },
  { v: "withdrawn", label: "Trukket" },
];

const ApplicationDetail = () => {
  const { id } = useParams();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [app, setApp] = useState<any>(null);
  const [text, setText] = useState("");
  const [preview, setPreview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, [id]);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const { data } = await supabase.from("applications").select("*, jobs(*)").eq("id", id).maybeSingle();
    setApp(data);
    setText(data?.generated_text ?? "");
    setLoading(false);
  };

  const save = async () => {
    setSaving(true);
    await supabase.from("applications").update({ generated_text: text }).eq("id", app.id);
    setSaving(false);
    toast({ title: "Lagret" });
  };

  const setStatus = async (status: string) => {
    const upd: any = { status };
    if (status === "sent" && !app.sent_at) upd.sent_at = new Date().toISOString();
    await supabase.from("applications").update(upd).eq("id", app.id);
    if (status === "sent") {
      await supabase.from("jobs").update({ status: "applied" as any }).eq("id", app.job_id);
      await supabase.from("application_events").insert({
        user_id: app.user_id, application_id: app.id, event_type: "sent",
        description: "Søknad sendt",
      });
    }
    load();
  };

  const remove = async () => {
    if (!confirm("Slett søknaden?")) return;
    await supabase.from("applications").delete().eq("id", app.id);
    navigate("/applications");
  };

  if (loading) return <div className="p-8 flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Laster…</div>;
  if (!app) return <div className="p-8">Søknad ikke funnet.</div>;

  return (
    <div className="max-w-4xl mx-auto p-6 lg:p-10 space-y-6">
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

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Søknadstekst</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPreview(!preview)}>
              {preview ? "Rediger" : "Forhåndsvis"}
            </Button>
            <Button size="sm" onClick={save} disabled={saving}>
              <Save className="w-4 h-4 mr-2" /> Lagre
            </Button>
            {app.status === "draft" && (
              <Button size="sm" variant="default" onClick={() => setStatus("sent")}>
                <Send className="w-4 h-4 mr-2" /> Marker som sendt
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {preview ? (
            <div className="prose-app max-w-none border border-border rounded-md p-6 bg-card min-h-[400px]">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
            </div>
          ) : (
            <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={20} className="font-mono text-sm" />
          )}
        </CardContent>
      </Card>

      {app.cv_notes && (
        <Card>
          <CardHeader><CardTitle className="text-base">CV-tilpasningsnotater</CardTitle></CardHeader>
          <CardContent>
            <div className="prose-app max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{app.cv_notes}</ReactMarkdown>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Notater</CardTitle></CardHeader>
        <CardContent>
          <Textarea rows={4} defaultValue={app.notes ?? ""} onBlur={(e) => supabase.from("applications").update({ notes: e.target.value }).eq("id", app.id)} placeholder="Notater om svar, oppfølging…" />
        </CardContent>
      </Card>
    </div>
  );
};

export default ApplicationDetail;
