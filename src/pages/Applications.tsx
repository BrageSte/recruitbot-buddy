import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, FileText } from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = {
  draft: "Utkast",
  sent: "Sendt",
  response_received: "Svar mottatt",
  interview: "Intervju",
  offer: "Tilbud",
  rejected: "Avslag",
  withdrawn: "Trukket",
};

const STATUS_TONE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  response_received: "bg-purple-500/10 text-purple-700 dark:text-purple-300",
  interview: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  offer: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  rejected: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  withdrawn: "bg-muted text-muted-foreground",
};

type AppRow = {
  id: string;
  status: string;
  sent_at: string | null;
  created_at: string;
  jobs: { title: string; company: string | null } | null;
};

type TabKey = "active" | "sent" | "responded" | "closed" | "all";

const TABS: { key: TabKey; label: string; statuses: string[] | null }[] = [
  { key: "active", label: "Aktive / Utkast", statuses: ["draft"] },
  { key: "sent", label: "Sendt", statuses: ["sent"] },
  { key: "responded", label: "Svar / Intervju", statuses: ["response_received", "interview", "offer"] },
  { key: "closed", label: "Avslag / Arkivert", statuses: ["rejected", "withdrawn"] },
  { key: "all", label: "Alle", statuses: null },
];

const Applications = () => {
  const { user } = useAuth();
  const [items, setItems] = useState<AppRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = (searchParams.get("tab") as TabKey) ?? "active";
  const activeTab: TabKey = TABS.some((t) => t.key === tabParam) ? tabParam : "active";

  useEffect(() => {
    if (!user) return;
    supabase
      .from("applications")
      .select("id, status, sent_at, created_at, jobs(title, company)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setItems((data ?? []) as any);
        setLoading(false);
      });
  }, [user]);

  const counts = useMemo(() => {
    const c: Record<TabKey, number> = { active: 0, sent: 0, responded: 0, closed: 0, all: items.length };
    for (const it of items) {
      for (const t of TABS) {
        if (t.statuses && t.statuses.includes(it.status)) c[t.key]++;
      }
    }
    return c;
  }, [items]);

  const filtered = useMemo(() => {
    const def = TABS.find((t) => t.key === activeTab);
    if (!def?.statuses) return items;
    return items.filter((i) => def.statuses!.includes(i.status));
  }, [items, activeTab]);

  return (
    <div className="max-w-5xl mx-auto p-6 lg:p-10 space-y-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Søknader</h1>
        <p className="text-muted-foreground text-sm mt-1">Alle dine genererte og sendte søknader.</p>
      </header>

      <Tabs
        value={activeTab}
        onValueChange={(v) => {
          const next = new URLSearchParams(searchParams);
          next.set("tab", v);
          setSearchParams(next, { replace: true });
        }}
      >
        <TabsList className="w-full justify-start flex-wrap h-auto gap-1 bg-muted/50 p-1">
          {TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key} className="data-[state=active]:bg-background">
              {t.label}
              <span className="ml-1.5 text-[11px] text-muted-foreground tabular-nums">{counts[t.key]}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {TABS.map((t) => (
          <TabsContent key={t.key} value={t.key} className="mt-5">
            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Laster…
              </div>
            ) : filtered.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center text-muted-foreground">
                  <FileText className="w-8 h-8 mx-auto mb-3 opacity-40" />
                  <p>Ingen søknader i denne kategorien.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {filtered.map((a) => (
                  <Link key={a.id} to={`/applications/${a.id}`}>
                    <Card className="hover:shadow-elevated transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <h3 className="font-semibold">{a.jobs?.title ?? "Ukjent jobb"}</h3>
                          {a.jobs?.company && (
                            <span className="text-sm text-muted-foreground">· {a.jobs.company}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground flex-wrap">
                          <span
                            className={cn(
                              "px-1.5 py-0.5 rounded font-medium",
                              STATUS_TONE[a.status] ?? "bg-muted text-muted-foreground"
                            )}
                          >
                            {STATUS_LABELS[a.status] ?? a.status}
                          </span>
                          <span>
                            Opprettet {format(new Date(a.created_at), "d. MMM yyyy", { locale: nb })}
                          </span>
                          {a.sent_at && (
                            <span>· Sendt {format(new Date(a.sent_at), "d. MMM yyyy", { locale: nb })}</span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};

export default Applications;
