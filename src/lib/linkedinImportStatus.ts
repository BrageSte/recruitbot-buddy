export type LinkedInImportStatus = "ok" | "blocked" | "empty" | "error" | "pending";

export const linkedinImportStatusCopy = (
  status: LinkedInImportStatus | undefined,
  fallback?: string | null,
) => {
  switch (status) {
    case "ok":
      return {
        title: "LinkedIn-tekst hentet",
        detail: fallback ?? "Offentlig LinkedIn-tekst brukes som supplement.",
      };
    case "blocked":
      return {
        title: "LinkedIn lagret som hint",
        detail: fallback ?? "LinkedIn blokkerte henting. CV eller egne nøkkelpunkter gir bedre treff.",
      };
    case "empty":
      return {
        title: "LinkedIn lagret som hint",
        detail: fallback ?? "Siden ga ikke nok offentlig tekst. URL-en tas likevel med i profilen.",
      };
    case "error":
      return {
        title: "LinkedIn kunne ikke hentes",
        detail: fallback ?? "URL-en kan fortsatt brukes som manuelt hint.",
      };
    case "pending":
    default:
      return {
        title: "LinkedIn klar som hint",
        detail: fallback ?? "Vi prøver å hente offentlig tekst når du ber om det.",
      };
  }
};
