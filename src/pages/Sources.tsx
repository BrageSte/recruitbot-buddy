import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, RefreshCw, Rss, AlertCircle } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { nb } from "date-fns/locale";

type Feed = {
  id: string;
  name: string;
  url: string;
  is_active: boolean;
  last_checked_at: string | null;
  items_found: number;
  last_error: string | null;
};

const Sources = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [polling, setPolling] = useState<string | null>(null);

  useEffect(() => { load(); }, [user]);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase.from("rss_feeds").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    setFeeds((data ?? []) as Feed[]);
    setLoading(false);
  };

  const add = async () => {
    if (!user || !name.trim() || !url.trim()) {
      toast({ title: "Navn og URL kreves", variant: "destructive" });
      return;
    }
    setAdding(true);
    const { error } = await supabase.from("rss_feeds").insert({
      user_id: user.id, name: name.trim(), url: url.trim(),
    });
    setAdding(false);
    if (error) toast({ title: "Feilet", description: error.message, variant: "destructive" });
    else { setName(""); setUrl(""); load(); }
  };

  const toggleActive = async (f: Feed) => {
    await supabase.from("rss_feeds").update({ is_active: !f.is_active }).eq("id", f.id);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Slett feeden?")) return;
    await supabase.from("rss_feeds").delete().eq("id", id);
    load();
  };

  const pollNow = async (feedId?: string) => {
    setPolling(feedId ?? "all");
    try {
      const { data, error } = await supabase.functions.invoke("poll-rss", {
        body: feedId ? { feedId, userId: user!.id } : { userId: user!.id },
      });
      if (error) throw error;
      const d: any = data;
      toast({
        title: "Sjekket",
        description: `${d.feeds ?? 0} feed(s), ${d.newItems ?? 0} nye jobber.`,
      });
      load();
    } catch (e: any) {
      toast({ title: "Feilet", description: e.message, variant: "destructive" });
    } finally {
      setPolling(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 lg:p-10 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Kilder</h1>
          <p className="text-muted-foreground text-sm mt-1">RSS-feeds som overvåkes automatisk hvert 30. minutt.</p>
        </div>
        <Button variant="outline" onClick={() => pollNow()} disabled={polling !== null}>
          {polling === "all" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          Sjekk alle nå
        </Button>
      </header>

      <Card>
        <CardHeader><CardTitle className="text-base">Legg til RSS-feed</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Navn</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="f.eks. Finn – Utvikler Oslo" />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>RSS-URL</Label>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.finn.no/job/...rss" />
            </div>
          </div>
          <Button onClick={add} disabled={adding}>
            {adding ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            Legg til
          </Button>
          <p className="text-xs text-muted-foreground">
            På finn.no: gjør et søk → "Lagre søk" → finn RSS-lenken under "Mine sider → Lagrede søk".
          </p>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Laster…</div>
      ) : feeds.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">
          <Rss className="w-8 h-8 mx-auto mb-3 opacity-40" />
          <p>Ingen feeds ennå.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {feeds.map((f) => (
            <Card key={f.id}>
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <Switch checked={f.is_active} onCheckedChange={() => toggleActive(f)} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{f.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{f.url}</div>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span>{f.items_found} treff totalt</span>
                      {f.last_checked_at && (
                        <span>Sist sjekket {formatDistanceToNow(new Date(f.last_checked_at), { addSuffix: true, locale: nb })}</span>
                      )}
                      {f.last_error && (
                        <span className="text-destructive flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> {f.last_error}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => pollNow(f.id)} disabled={polling !== null}>
                      {polling === f.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => remove(f.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default Sources;
