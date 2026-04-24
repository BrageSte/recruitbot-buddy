import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, FileText } from "lucide-react";
import { format } from "date-fns";

const STATUS_LABELS: Record<string, string> = {
  draft: "Utkast", sent: "Sendt", response_received: "Svar mottatt",
  interview: "Intervju", offer: "Tilbud", rejected: "Avslag", withdrawn: "Trukket",
};

const Applications = () => {
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase.from("applications").select("*, jobs(title, company)").eq("user_id", user.id).order("created_at", { ascending: false })
      .then(({ data }) => { setItems(data ?? []); setLoading(false); });
  }, [user]);

  return (
    <div className="max-w-5xl mx-auto p-6 lg:p-10 space-y-6">
      <header>
        <h1 className="text-3xl font-semibold">Søknader</h1>
        <p className="text-muted-foreground text-sm mt-1">Alle dine genererte og sendte søknader.</p>
      </header>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Laster…</div>
      ) : items.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">
          <FileText className="w-8 h-8 mx-auto mb-3 opacity-40" />
          <p>Ingen søknader ennå. Generer en fra en jobb.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {items.map((a) => (
            <Link key={a.id} to={`/applications/${a.id}`}>
              <Card className="hover:shadow-elevated transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-baseline gap-2">
                    <h3 className="font-semibold">{a.jobs?.title ?? "Ukjent jobb"}</h3>
                    {a.jobs?.company && <span className="text-sm text-muted-foreground">· {a.jobs.company}</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                    <span className="px-1.5 py-0.5 bg-muted rounded">{STATUS_LABELS[a.status] ?? a.status}</span>
                    <span>Opprettet {format(new Date(a.created_at), "dd.MM.yyyy")}</span>
                    {a.sent_at && <span>· Sendt {format(new Date(a.sent_at), "dd.MM.yyyy")}</span>}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default Applications;
