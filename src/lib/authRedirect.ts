export const DEFAULT_POST_AUTH_TARGET = "/portal";
export const POST_AUTH_TARGET_KEY = "post_auth_target";

type RedirectLocation = {
  pathname?: string;
  search?: string;
  hash?: string;
};

const PUBLIC_ENTRY_PATHS = ["/login", "/auth", "/start", "/demo", "/landing"];

const matchesPath = (target: string, path: string) =>
  target === path || target.startsWith(`${path}/`) || target.startsWith(`${path}?`) || target.startsWith(`${path}#`);

export const normalizePostAuthTarget = (target: string | null | undefined) => {
  if (!target || !target.startsWith("/") || target.startsWith("//")) return null;
  if (target === "/" || PUBLIC_ENTRY_PATHS.some((path) => matchesPath(target, path))) return null;
  return target;
};

export const postAuthTargetFromLocation = (location: RedirectLocation | null | undefined) => {
  if (!location?.pathname) return null;
  return normalizePostAuthTarget(`${location.pathname}${location.search ?? ""}${location.hash ?? ""}`);
};

export const storePostAuthTarget = (target: string | null | undefined) => {
  if (typeof window === "undefined") return;
  const normalized = normalizePostAuthTarget(target);
  if (normalized) window.sessionStorage.setItem(POST_AUTH_TARGET_KEY, normalized);
};

export const takePostAuthTarget = () => {
  if (typeof window === "undefined") return null;
  const target = window.sessionStorage.getItem(POST_AUTH_TARGET_KEY);
  if (target) window.sessionStorage.removeItem(POST_AUTH_TARGET_KEY);
  return normalizePostAuthTarget(target);
};
