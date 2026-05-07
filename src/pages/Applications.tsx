import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  FileText,
  Send,
  CalendarClock,
  Award,
  Briefcase,
  Search,
  ArrowUpDown,
  ChevronDown,
  Sparkles,
} from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { KpiStrip } from "@/components/KpiStrip";
import { EmptyState } from "@/components/EmptyState";
import {
  APPLICATION_STATUS_LABEL,
  APPLICATION_STATUS_STRIPE,
  APPLICATION_STATUS_TONE,
} from "@/lib/statusStyles";

type AppRow = {
  id: string;
  status: string;
  sent_at: string | null;
  created_at: string;
  jobs: { title: string; company: string | null } | null;
};

type TabKey = "active" | "sent" | "responded" | "closed" | "all";
type SortKey = "created_desc" | "created_asc" | "sent_desc" | "status";

const TABS: { key: TabKey; label: string; statuses: string[] | null }[] = [
  { key: "active", label: "Utkast", statuses: ["draft"] },
  { key: "sent", label: "Sendt", statuses: ["sent"] },
  { key: "responded", label: "Svar / Intervju", statuses: ["response_received", "interview", "offer"] },
  { key: "closed", label: "Avslag / Arkivert", statuses: ["rejected", "withdrawn"] },
  { key: "all", label: "Alle", statuses: null },
];

const SORTS: { v: SortKey; label: string }[] = [
  { v: "created_desc", label: "Nyeste først" },
  { v: "created_asc", label: "Eldste først" },
  { v: "sent_desc", label: "Sist sendt" },
  { v: "status", label: "Status" },
];

const STATUS_ICON: Record<string, typeof FileText> = {
  draft: FileText,
  sent: Send,
  response_received: Sparkles,
  interview: CalendarClock,
  offer: Award,
  rejected: FileText,
  withdrawn: FileText,
};

const Applications = () => {
  const { user } = useAuth();
  const [items, setItems] = useState<AppRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("created_desc");

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

  const kpis = useMemo(
    () => [
      { label: "Utkast", value: counts.active, icon: FileText, tone: "default" as const },
      { label: "Sendt", value: counts.sent, icon: Send, tone: "primary" as const },
      { label: "Svar / Intervju", value: counts.responded, icon: CalendarClock, tone: "warning" as const },
      {
        label: "Tilbud",
        value: items.filter((i) => i.status === "offer").length,
        icon: Award,
        tone: "success" as const,
      },
    ],
    [counts, items]
  );

  const filtered = useMemo(() => {
    const def = TABS.find((t) => t.key === activeTab);
    let list = def?.statuses ? items.filter((i) => def.statuses!.includes(i.status)) : items;

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (i) =>
          (i.jobs?.title ?? "").toLowerCase().includes(q) ||
          (i.jobs?.company ?? "").toLowerCase().includes(q)
      );
    }

    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (sortBy) {
        case "created_asc":
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case "sent_desc": {
          const sa = a.sent_at ? new Date(a.sent_at).getTime() : 0;
          const sb = b.sent_at ? new Date(b.sent_at).getTime() : 0;
          return sb - sa;
        }
        case "status":
          return a.status.localeCompare(b.status);
        case "created_desc":
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });
    return sorted;
  }, [items, activeTab, search, sortBy]);

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 lg:p-10 space-y-6">
      <PageHeader
        icon={FileText}
        title="Søknader"
        description="Alle utkast, sendte søknader og svar samlet på ett sted."
        actions={
          <Button asChild size="sm" className="gap-1.5">
            <Link to="/jobs">
              <Briefcase className="w-3.5 h-3.5" />
              Finn jobber
            </Link>
          </Button>
        }
      />

      <KpiStrip items={kpis} />

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

        <div className="mt-4 flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Søk i tittel eller firma…"
              className="pl-8 h-9"
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <ArrowUpDown className="w-3.5 h-3.5 mr-1.5" />
                {SORTS.find((s) => s.v === sortBy)?.label}
                <ChevronDown className="w-3 h-3 ml-1.5 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="text-xs">Sorter etter</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {SORTS.map((s) => (
                <DropdownMenuItem
                  key={s.v}
                  onClick={() => setSortBy(s.v)}
                  className={sortBy === s.v ? "bg-accent" : ""}
                >
                  {s.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {TABS.map((t) => (
          <TabsContent key={t.key} value={t.key} className="mt-5">
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-[72px] w-full" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={FileText}
                title={search ? "Ingen treff" : "Ingen søknader her ennå"}
                description={
                  search
                    ? "Prøv et annet søkeord eller bytt fane."
                    : "Når du genererer en søknad fra en jobbmatch dukker den opp her."
                }
                action={
                  !search && (
                    <Button asChild>
                      <Link to="/jobs">
                        <Briefcase className="w-4 h-4 mr-2" /> Finn jobber
                      </Link>
                    </Button>
                  )
                }
              />
            ) : (
              <div className="space-y-2">
                {filtered.map((a) => {
                  const Icon = STATUS_ICON[a.status] ?? FileText;
                  return (
                    <Link key={a.id} to={`/applications/${a.id}`}>
                      <Card
                        className={cn(
                          "hover:shadow-elevated transition-shadow border-l-2",
                          APPLICATION_STATUS_STRIPE[a.status] ?? "border-l-muted-foreground/40"
                        )}
                      >
                        <CardContent className="p-4 flex items-start gap-3">
                          <div className="w-9 h-9 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
                            <Icon className="w-4 h-4 text-muted-foreground" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <h3 className="font-semibold truncate">{a.jobs?.title ?? "Ukjent jobb"}</h3>
                              {a.jobs?.company && (
                                <span className="text-sm text-muted-foreground truncate">· {a.jobs.company}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground flex-wrap">
                              <span
                                className={cn(
                                  "px-1.5 py-0.5 rounded font-medium",
                                  APPLICATION_STATUS_TONE[a.status] ?? "bg-muted text-muted-foreground"
                                )}
                              >
                                {APPLICATION_STATUS_LABEL[a.status] ?? a.status}
                              </span>
                              <span>
                                Opprettet {format(new Date(a.created_at), "d. MMM yyyy", { locale: nb })}
                              </span>
                              {a.sent_at && (
                                <span>
                                  · Sendt {format(new Date(a.sent_at), "d. MMM yyyy", { locale: nb })}
                                </span>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};

export default Applications;
