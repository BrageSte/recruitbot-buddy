import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Sparkles, Undo2, Wand2, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Turn = {
  id: string;
  instruction: string;
  selection?: string;
  status: "pending" | "applied" | "reverted" | "error";
  errorMessage?: string;
  before: string;
  after?: string;
};

interface ApplicationChatEditorProps {
  applicationId: string;
  text: string;
  onTextChange: (next: string) => void;
  selection?: string;
  onClearSelection?: () => void;
  jobTitle?: string;
  company?: string;
  jobDescription?: string;
}

const QUICK_ACTIONS = [
  "Gjør den kortere og mer direkte",
  "Mindre akademisk, mer personlig",
  "Fjern alle bindestreker",
  "Mer entusiastisk åpning",
  "Bytt ut floskler med konkrete eksempler",
];

export const ApplicationChatEditor = ({
  applicationId,
  text,
  onTextChange,
  selection,
  onClearSelection,
  jobTitle,
  company,
  jobDescription,
}: ApplicationChatEditorProps) => {
  const { toast } = useToast();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset chat when switching applications
  useEffect(() => {
    setTurns([]);
    setInput("");
  }, [applicationId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy]);

  const send = async (instructionRaw: string) => {
    const instruction = instructionRaw.trim();
    if (!instruction || busy) return;
    if (!text.trim()) {
      toast({ title: "Tom tekst", description: "Generer eller skriv en søknad først.", variant: "destructive" });
      return;
    }

    const turnId = crypto.randomUUID();
    const before = text;
    const sel = selection?.trim() || undefined;

    setTurns((t) => [...t, { id: turnId, instruction, selection: sel, status: "pending", before }]);
    setInput("");
    setBusy(true);

    try {
      const { data, error } = await supabase.functions.invoke("edit-application", {
        body: { currentText: before, instruction, selection: sel, jobTitle, company, jobDescription },
      });
      if (error) throw error;
      const d = data as { newText?: string; error?: string };
      if (d.error) throw new Error(d.error);
      if (!d.newText) throw new Error("Tomt svar");

      onTextChange(d.newText);
      // Persist the edit immediately
      await supabase.from("applications").update({ generated_text: d.newText }).eq("id", applicationId);

      setTurns((t) => t.map((x) => (x.id === turnId ? { ...x, status: "applied", after: d.newText } : x)));
      onClearSelection?.();
    } catch (e: any) {
      const msg = e?.message || "Noe gikk galt";
      setTurns((t) => t.map((x) => (x.id === turnId ? { ...x, status: "error", errorMessage: msg } : x)));
      toast({ title: "AI-redigering feilet", description: msg, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const undo = async (turn: Turn) => {
    onTextChange(turn.before);
    await supabase.from("applications").update({ generated_text: turn.before }).eq("id", applicationId);
    setTurns((t) => t.map((x) => (x.id === turn.id ? { ...x, status: "reverted" } : x)));
    toast({ title: "Endring angret" });
  };

  return (
    <div className="flex flex-col h-full bg-card border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2 bg-muted/30">
        <Wand2 className="w-4 h-4 text-primary" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">AI-redigering</div>
          <div className="text-[11px] text-muted-foreground">
            Skriv hva du vil endre — på naturlig språk
          </div>
        </div>
      </div>

      {/* Selection banner */}
      {selection && selection.trim() && (
        <div className="px-3 py-2 bg-primary/10 border-b border-primary/20 flex items-start gap-2">
          <Sparkles className="w-3.5 h-3.5 mt-0.5 text-primary shrink-0" />
          <div className="flex-1 min-w-0 text-xs">
            <div className="font-medium text-primary mb-0.5">Endrer kun valgt tekst</div>
            <div className="text-muted-foreground line-clamp-2">"{selection.trim()}"</div>
          </div>
          {onClearSelection && (
            <button
              onClick={onClearSelection}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Fjern utvalg"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Conversation log */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2 min-h-[180px] max-h-[360px]">
        {turns.length === 0 && !busy && (
          <div className="text-xs text-muted-foreground text-center py-6 px-4">
            Prøv f.eks. <em>"gjør avsnittet om erfaring mer personlig"</em> eller <em>"fjern alle bindestreker"</em>.
            <br />
            Tips: marker tekst i editoren først for å endre kun den biten.
          </div>
        )}

        {turns.map((t) => (
          <div key={t.id} className="space-y-1.5">
            <div className="flex justify-end">
              <div className="max-w-[85%] bg-primary text-primary-foreground px-3 py-2 rounded-2xl rounded-br-sm text-sm">
                {t.instruction}
                {t.selection && (
                  <div className="text-[10px] opacity-75 mt-1 italic line-clamp-1">↳ på utvalg</div>
                )}
              </div>
            </div>
            <div className="flex justify-start">
              <div
                className={cn(
                  "max-w-[85%] px-3 py-2 rounded-2xl rounded-bl-sm text-xs flex items-center gap-2",
                  t.status === "pending" && "bg-muted text-muted-foreground",
                  t.status === "applied" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20",
                  t.status === "reverted" && "bg-muted text-muted-foreground",
                  t.status === "error" && "bg-destructive/10 text-destructive border border-destructive/20"
                )}
              >
                {t.status === "pending" && (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" /> Redigerer…
                  </>
                )}
                {t.status === "applied" && (
                  <>
                    <Sparkles className="w-3 h-3" /> Endring brukt
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 px-1.5 ml-1 text-xs hover:bg-emerald-500/20"
                      onClick={() => undo(t)}
                    >
                      <Undo2 className="w-3 h-3 mr-1" /> Angre
                    </Button>
                  </>
                )}
                {t.status === "reverted" && (
                  <>
                    <Undo2 className="w-3 h-3" /> Angret
                  </>
                )}
                {t.status === "error" && <>Feil: {t.errorMessage}</>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      {turns.length === 0 && (
        <div className="px-3 pb-2 flex flex-wrap gap-1.5">
          {QUICK_ACTIONS.map((q) => (
            <button
              key={q}
              onClick={() => send(q)}
              disabled={busy}
              className="text-[11px] px-2 py-1 rounded-full bg-muted hover:bg-accent text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="p-3 border-t border-border bg-muted/20">
        <div className="flex gap-2 items-end">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder="Hva skal endres? (Enter for å sende, Shift+Enter = ny linje)"
            rows={2}
            className="resize-none text-sm min-h-[44px]"
            disabled={busy}
          />
          <Button onClick={() => send(input)} disabled={busy || !input.trim()} size="sm" className="shrink-0">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
};
