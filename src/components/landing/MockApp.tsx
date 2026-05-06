import { Briefcase, CalendarClock, FileText, Search, Sparkles } from "lucide-react";

const MockChrome = ({ children, label }: { children: React.ReactNode; label: string }) => (
  <div className="rounded-xl border border-border/70 bg-background shadow-2xl shadow-primary/10 overflow-hidden">
    <div className="h-9 flex items-center gap-2 px-3 border-b border-border/70 bg-muted/40">
      <span className="w-2.5 h-2.5 rounded-full bg-red-400/70" />
      <span className="w-2.5 h-2.5 rounded-full bg-yellow-400/70" />
      <span className="w-2.5 h-2.5 rounded-full bg-green-400/70" />
      <span className="ml-3 text-xs text-muted-foreground">{label}</span>
    </div>
    <div className="p-4 md:p-5">{children}</div>
  </div>
);

const Score = ({ value }: { value: number }) => {
  const color =
    value >= 80 ? "bg-emerald-500/15 text-emerald-600" :
    value >= 60 ? "bg-amber-500/15 text-amber-600" :
    "bg-rose-500/15 text-rose-600";
  return <span className={`px-2 py-0.5 rounded-md text-xs font-semibold tabular-nums ${color}`}>{value}</span>;
};

export const MockMatches = () => (
  <MockChrome label="jobbhjelpen.app / matches">
    <div className="flex items-center justify-between mb-4">
      <div>
        <div className="text-xs text-muted-foreground">Dine matcher</div>
        <div className="text-lg font-semibold">42 nye jobber denne uken</div>
      </div>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Sparkles className="w-3.5 h-3.5 text-primary" /> AI-rekrutterer
      </div>
    </div>
    <div className="space-y-2">
      {[
        { t: "Produktleder – B2B SaaS", c: "Nordic Insights", l: "Oslo / hybrid", s: 92 },
        { t: "Senior Frontend (React)", c: "Folio", l: "Oslo", s: 88 },
        { t: "Customer Success Manager", c: "Lyra", l: "Remote (Norge)", s: 81 },
        { t: "Data Analyst – Vekst", c: "Stack Mobility", l: "Oslo / hybrid", s: 74 },
        { t: "Prosjektleder digitalisering", c: "Helse Nord", l: "Tromsø", s: 58 },
      ].map((row, i) => (
        <div key={i} className="flex items-center justify-between py-2.5 px-3 rounded-md border border-border/60 hover:bg-muted/30 transition-colors">
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{row.t}</div>
            <div className="text-xs text-muted-foreground truncate">{row.c} · {row.l}</div>
          </div>
          <Score value={row.s} />
        </div>
      ))}
    </div>
  </MockChrome>
);

export const MockCv = () => (
  <MockChrome label="jobbhjelpen.app / cv">
    <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.4fr] gap-4">
      <div className="rounded-md border border-border/60 p-3 space-y-3 bg-muted/20">
        <div className="text-xs text-muted-foreground flex items-center gap-1.5"><Sparkles className="w-3 h-3 text-primary" /> Tilpass for jobben</div>
        <div className="space-y-1.5">
          <div className="h-2 rounded bg-muted w-3/4" />
          <div className="h-2 rounded bg-muted w-1/2" />
        </div>
        <div className="rounded bg-primary/10 text-primary text-xs px-2 py-1.5 font-medium">Generér CV →</div>
      </div>
      <div className="rounded-md border border-border/60 p-4 bg-background">
        <div className="text-sm font-semibold">Anna Berg</div>
        <div className="text-xs text-muted-foreground">Produktleder · Oslo</div>
        <div className="mt-3 space-y-2">
          <div className="h-1.5 rounded bg-muted w-full" />
          <div className="h-1.5 rounded bg-muted w-5/6" />
          <div className="h-1.5 rounded bg-muted w-4/6" />
          <div className="mt-3 text-[10px] uppercase tracking-wider text-muted-foreground">Erfaring</div>
          <div className="h-1.5 rounded bg-muted w-full" />
          <div className="h-1.5 rounded bg-muted w-3/4" />
          <div className="h-1.5 rounded bg-muted w-5/6" />
        </div>
      </div>
    </div>
  </MockChrome>
);

export const MockPipeline = () => (
  <MockChrome label="jobbhjelpen.app / applications">
    <div className="grid grid-cols-4 gap-2">
      {[
        { l: "Utkast", n: 4, i: FileText },
        { l: "Sendt", n: 7, i: Briefcase },
        { l: "Intervju", n: 2, i: CalendarClock },
        { l: "Svar", n: 1, i: Search },
      ].map((s, i) => (
        <div key={i} className="rounded-md border border-border/60 p-3 bg-muted/20">
          <s.i className="w-4 h-4 text-primary mb-2" />
          <div className="text-2xl font-semibold tabular-nums">{s.n}</div>
          <div className="text-xs text-muted-foreground">{s.l}</div>
        </div>
      ))}
    </div>
    <div className="mt-3 space-y-1.5">
      {["Folio – Senior Frontend", "Lyra – Customer Success", "Nordic Insights – Produktleder"].map((t, i) => (
        <div key={i} className="flex items-center justify-between py-2 px-3 rounded-md border border-border/60 text-sm">
          <span>{t}</span>
          <span className="text-xs text-muted-foreground">Frist 22. mai</span>
        </div>
      ))}
    </div>
  </MockChrome>
);
