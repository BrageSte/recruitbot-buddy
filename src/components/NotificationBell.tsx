import { Link } from "react-router-dom";
import { Bell, CheckCheck, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNotifications } from "@/hooks/useNotifications";
import { formatDistanceToNow } from "date-fns";
import { nb } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useState } from "react";

export const NotificationBell = () => {
  const { items, unreadCount, markRead, markAllRead, remove } = useNotifications();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Varsler" className="relative">
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-medium flex items-center justify-center tabular-nums">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between p-3 border-b border-border">
          <div className="text-sm font-semibold">Varsler</div>
          {items.length > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={markAllRead}>
              <CheckCheck className="w-3.5 h-3.5 mr-1" /> Marker alle som lest
            </Button>
          )}
        </div>

        <ScrollArea className="max-h-[420px]">
          {items.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <Bell className="w-6 h-6 mx-auto mb-2 opacity-40" />
              Ingen varsler ennå.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((n) => {
                const href = n.job_id
                  ? `/jobs/${n.job_id}`
                  : n.application_id
                  ? `/applications/${n.application_id}`
                  : null;
                const score = n.metadata?.score as number | undefined;
                const Wrapper: any = href ? Link : "div";
                return (
                  <li key={n.id} className="group relative">
                    <Wrapper
                      to={href ?? undefined}
                      onClick={() => {
                        if (!n.read_at) markRead(n.id);
                        if (href) setOpen(false);
                      }}
                      className={cn(
                        "block p-3 pr-9 transition-colors",
                        href && "hover:bg-accent/40 cursor-pointer",
                        !n.read_at && "bg-primary/5"
                      )}
                    >
                      <div className="flex items-start gap-2">
                        {n.kind === "high_match_job" && (
                          <Sparkles className="w-3.5 h-3.5 mt-0.5 text-primary shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <p className={cn("text-sm leading-snug break-words", !n.read_at && "font-semibold")}>
                              {n.title}
                            </p>
                            {score != null && (
                              <span className="text-[10px] font-semibold text-primary tabular-nums shrink-0">
                                {score}
                              </span>
                            )}
                          </div>
                          {n.body && <p className="text-xs text-muted-foreground break-words mt-0.5">{n.body}</p>}
                          <p className="text-[10px] text-muted-foreground mt-1">
                            {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: nb })}
                          </p>
                        </div>
                      </div>
                    </Wrapper>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        remove(n.id);
                      }}
                      aria-label="Fjern varsel"
                      className="absolute top-2.5 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted"
                    >
                      <X className="w-3 h-3 text-muted-foreground" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};
