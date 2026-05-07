import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { CvData } from "@/components/cv/types";
import {
  formatOriginalCvItemsForInstruction,
  getOmittedOriginalCvItems,
} from "@/components/cv/cvInclusionDiff";
import { ListChecks, Loader2, RotateCcw, Sparkles, Undo2, Wand2 } from "lucide-react";

type Turn = {
  id: string;
  instruction: string;
  focusSection: string;
  status: "pending" | "applied" | "reverted" | "error";
  errorMessage?: string;
  summary?: string;
  before: CvData;
  after?: CvData;
};

interface CvTailoringChatEditorProps {
  applicationId: string;
  userId?: string;
  cv: CvData;
  originalCv?: CvData | null;
  tweak?: any;
  onTweakChange: (nextTweak: any) => void;
}

const QUICK_ACTIONS = [
  "Gjør introen mer konkret",
  "Kort ned lange punkter",
  "Fremhev mest relevant erfaring",
  "Prioriter ferdighetene bedre",
  "Ton ned det som er mindre relevant",
];

const FOCUS_OPTIONS = [
  { value: "auto", label: "Hele CV-en" },
  { value: "intro", label: "Intro" },
  { value: "experiences", label: "Erfaring" },
  { value: "skills", label: "Ferdigheter" },
  { value: "education", label: "Utdanning" },
  { value: "projects", label: "Prosjekter" },
];

export const CvTailoringChatEditor = ({
  applicationId,
  userId,
  cv,
  originalCv,
  tweak,
  onTweakChange,
}: CvTailoringChatEditorProps) => {
  const { toast } = useToast();
  const [input, setInput] = useState("");
  const [focusSection, setFocusSection] = useState("auto");
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [selectedOriginalItemIds, setSelectedOriginalItemIds] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const omittedGroups = useMemo(
    () => getOmittedOriginalCvItems(originalCv, cv),
    [originalCv, cv],
  );
  const omittedItems = useMemo(() => omittedGroups.flatMap((group) => group.items), [omittedGroups]);
  const omittedItemById = useMemo(
    () => new Map(omittedItems.map((item) => [item.id, item])),
    [omittedItems],
  );
  const omittedItemIds = useMemo(() => omittedItems.map((item) => item.id).join("|"), [omittedItems]);
  const selectedOmittedItems = selectedOriginalItemIds
    .map((id) => omittedItemById.get(id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  useEffect(() => {
    setTurns([]);
    setInput("");
    setFocusSection("auto");
    setSelectedOriginalItemIds([]);
  }, [applicationId]);

  useEffect(() => {
    setSelectedOriginalItemIds((ids) => ids.filter((id) => omittedItemById.has(id)));
  }, [omittedItemById, omittedItemIds]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy]);

  const send = async (
    instructionRaw: string,
    options?: { displayInstruction?: string; focusSection?: string; onApplied?: () => void },
  ) => {
    const instruction = instructionRaw.trim();
    if (!instruction || busy) return;

    const turnId = crypto.randomUUID();
    const before = cv;
    const activeFocusSection = options?.focusSection ?? focusSection;
    setTurns((items) => [
      ...items,
      {
        id: turnId,
        instruction: options?.displayInstruction ?? instruction,
        focusSection: activeFocusSection,
        status: "pending",
        before,
      },
    ]);
    setInput("");
    setBusy(true);

    try {
      const { data, error } = await supabase.functions.invoke("edit-tailored-cv", {
        body: { applicationId, instruction, focusSection: activeFocusSection },
      });
      if (error) throw error;

      const response = data as { tweak?: any; changeSummary?: string; error?: string };
      if (response.error) throw new Error(response.error);
      if (!response.tweak?.tailored_cv) throw new Error("Tomt svar");

      onTweakChange(response.tweak);
      options?.onApplied?.();
      setTurns((items) =>
        items.map((item) =>
          item.id === turnId
            ? {
                ...item,
                status: "applied",
                after: response.tweak.tailored_cv as CvData,
                summary: response.changeSummary,
              }
            : item
        )
      );
    } catch (e: any) {
      const message = e?.message || "Noe gikk galt";
      setTurns((items) =>
        items.map((item) =>
          item.id === turnId ? { ...item, status: "error", errorMessage: message } : item
        )
      );
      toast({ title: "CV-endring feilet", description: message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const toggleOriginalItem = (id: string, checked: boolean) => {
    setSelectedOriginalItemIds((ids) => {
      if (checked) return ids.includes(id) ? ids : [...ids, id];
      return ids.filter((itemId) => itemId !== id);
    });
  };

  const includeSelectedOriginalItems = () => {
    if (selectedOmittedItems.length === 0 || busy) return;
    const instruction = [
      "Flett inn disse valgte elementene fra ORIGINAL CV i den tilpassede CV-snapshoten.",
      "Integrer dem i riktig seksjon, omformuler kort og relevant for stillingen, og plasser dem der de passer best. Ikke lim dem bare inn nederst.",
      "VALGTE_ORIGINAL_CV_ELEMENTER_JSON:",
      formatOriginalCvItemsForInstruction(selectedOmittedItems),
    ].join("\n\n");

    send(instruction, {
      displayInstruction: `Flett inn ${selectedOmittedItems.length} valgte fra original-CV`,
      focusSection: "auto",
      onApplied: () => setSelectedOriginalItemIds([]),
    });
  };

  const undo = async (turn: Turn) => {
    if (!turn.after) return;
    const sectionOrder = Array.isArray(turn.before.section_order) ? turn.before.section_order : null;
    const { data, error } = await supabase
      .from("application_cv_tweaks")
      .update({ tailored_cv: turn.before as any, section_order: sectionOrder } as any)
      .eq("application_id", applicationId)
      .select()
      .maybeSingle();

    if (error) {
      toast({ title: "Kunne ikke angre", description: error.message, variant: "destructive" });
      return;
    }

    if (userId) {
      await (supabase as any).from("application_cv_revisions").insert({
        user_id: userId,
        application_id: applicationId,
        tweak_id: tweak?.id ?? data?.id ?? null,
        instruction: `Angre: ${turn.instruction}`,
        previous_cv: turn.after,
        next_cv: turn.before,
        previous_section_order: turn.after.section_order ?? null,
        next_section_order: sectionOrder,
        metadata: { source: "undo", original_instruction: turn.instruction },
      });
    }

    onTweakChange(data);
    setTurns((items) =>
      items.map((item) => (item.id === turn.id ? { ...item, status: "reverted" } : item))
    );
    toast({ title: "CV-endring angret" });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-4 py-3">
        <Wand2 className="h-4 w-4 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">CV-verktøy</div>
          <div className="text-[11px] text-muted-foreground">
            Gi feedback på tilpasningen for denne søknaden
          </div>
        </div>
      </div>

      <div className="border-b border-border px-3 py-2">
        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Fokus
        </label>
        <select
          value={focusSection}
          onChange={(event) => setFocusSection(event.target.value)}
          disabled={busy}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          {FOCUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {originalCv && (
        <div className="border-b border-border bg-background px-3 py-3">
          <div className="mb-2 flex items-start gap-2">
            <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium">Utelatt fra original-CV</div>
                {omittedItems.length > 0 && (
                  <div className="shrink-0 text-[11px] text-muted-foreground">
                    {selectedOmittedItems.length}/{omittedItems.length} valgt
                  </div>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground">
                Velg det AI bør flette inn i denne versjonen.
              </div>
            </div>
          </div>

          {omittedItems.length === 0 ? (
            <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              AI har med alle gjenkjennelige originalelementer.
            </div>
          ) : (
            <div className="max-h-56 space-y-3 overflow-y-auto pr-1">
              {omittedGroups.map((group) => (
                <div key={group.section} className="space-y-1.5">
                  <div className="text-[11px] font-medium uppercase text-muted-foreground">
                    {group.label}
                  </div>
                  <div className="space-y-1">
                    {group.items.map((item) => (
                      <label
                        key={item.id}
                        className="flex min-h-11 cursor-pointer items-start gap-2 rounded-md border border-border/70 bg-muted/20 px-2.5 py-2 transition-colors hover:bg-accent/50"
                      >
                        <Checkbox
                          checked={selectedOriginalItemIds.includes(item.id)}
                          onCheckedChange={(checked) => toggleOriginalItem(item.id, checked === true)}
                          disabled={busy}
                          className="mt-0.5"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium">{item.label}</span>
                          {item.detail && (
                            <span className="block truncate text-[11px] text-muted-foreground">
                              {item.detail}
                            </span>
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {omittedItems.length > 0 && (
            <div className="mt-3 flex items-center justify-between gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedOriginalItemIds([])}
                disabled={busy || selectedOmittedItems.length === 0}
                className="h-8 px-2 text-xs"
              >
                Fjern valg
              </Button>
              <Button
                size="sm"
                onClick={includeSelectedOriginalItems}
                disabled={busy || selectedOmittedItems.length === 0}
                className="h-8 px-2 text-xs"
              >
                {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
                Flett inn valgte
              </Button>
            </div>
          )}
        </div>
      )}

      <div ref={scrollRef} className="min-h-[180px] flex-1 space-y-2 overflow-y-auto p-3">
        {turns.length === 0 && !busy && (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground">
            Prøv f.eks. <em>"gjør erfaringen fra kundeservice mer relevant"</em> eller{" "}
            <em>"kort ned introen til to setninger"</em>.
          </div>
        )}

        {turns.map((turn) => (
          <div key={turn.id} className="space-y-1.5">
            <div className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground">
                {turn.instruction}
                <div className="mt-1 text-[10px] opacity-75">
                  {FOCUS_OPTIONS.find((option) => option.value === turn.focusSection)?.label ?? "Hele CV-en"}
                </div>
              </div>
            </div>
            <div className="flex justify-start">
              <div
                className={cn(
                  "flex max-w-[85%] items-center gap-2 rounded-2xl rounded-bl-sm px-3 py-2 text-xs",
                  turn.status === "pending" && "bg-muted text-muted-foreground",
                  turn.status === "applied" &&
                    "border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                  turn.status === "reverted" && "bg-muted text-muted-foreground",
                  turn.status === "error" &&
                    "border border-destructive/20 bg-destructive/10 text-destructive"
                )}
              >
                {turn.status === "pending" && (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" /> Oppdaterer CV…
                  </>
                )}
                {turn.status === "applied" && (
                  <>
                    <Sparkles className="h-3 w-3" />
                    <span>{turn.summary || "Endring brukt"}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-1 h-5 px-1.5 text-xs hover:bg-emerald-500/20"
                      onClick={() => undo(turn)}
                    >
                      <Undo2 className="mr-1 h-3 w-3" /> Angre
                    </Button>
                  </>
                )}
                {turn.status === "reverted" && (
                  <>
                    <RotateCcw className="h-3 w-3" /> Angret
                  </>
                )}
                {turn.status === "error" && <>Feil: {turn.errorMessage}</>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {turns.length === 0 && (
        <div className="flex flex-wrap gap-1.5 px-3 pb-2">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action}
              type="button"
              onClick={() => send(action)}
              disabled={busy}
              className="rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
            >
              {action}
            </button>
          ))}
        </div>
      )}

      <div className="border-t border-border bg-muted/20 p-3">
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                send(input);
              }
            }}
            placeholder="Hva skal endres? (Enter for å sende)"
            rows={2}
            className="min-h-[44px] resize-none text-sm"
            disabled={busy}
          />
          <Button onClick={() => send(input)} disabled={busy || !input.trim()} size="sm" className="shrink-0">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
};
