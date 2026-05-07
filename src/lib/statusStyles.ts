// Shared status color tokens for consistent UI across pages.
// Uses semantic Tailwind classes only — no raw colors.

export const APPLICATION_STATUS_TONE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  response_received: "bg-purple-500/10 text-purple-700 dark:text-purple-300",
  interview: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  offer: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  rejected: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  withdrawn: "bg-muted text-muted-foreground",
};

export const APPLICATION_STATUS_STRIPE: Record<string, string> = {
  draft: "border-l-muted-foreground/40",
  sent: "border-l-blue-500",
  response_received: "border-l-purple-500",
  interview: "border-l-amber-500",
  offer: "border-l-emerald-500",
  rejected: "border-l-rose-500",
  withdrawn: "border-l-muted-foreground/40",
};

export const APPLICATION_STATUS_LABEL: Record<string, string> = {
  draft: "Utkast",
  sent: "Sendt",
  response_received: "Svar mottatt",
  interview: "Intervju",
  offer: "Tilbud",
  rejected: "Avslag",
  withdrawn: "Trukket",
};

export const JOB_STATUS_STRIPE: Record<string, string> = {
  discovered: "border-l-primary/60",
  considering: "border-l-blue-500",
  applied: "border-l-purple-500",
  interview: "border-l-amber-500",
  offer: "border-l-emerald-500",
  rejected: "border-l-rose-500",
  archived: "border-l-muted-foreground/30",
};

export const SOURCE_STATUS_STRIPE: Record<string, string> = {
  ok: "border-l-emerald-500",
  pending: "border-l-muted-foreground/30",
  blocked: "border-l-amber-500",
  error: "border-l-rose-500",
};
