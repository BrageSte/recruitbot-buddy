import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type LinkedInStatus = "ok" | "blocked" | "empty" | "error";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeLinkedInUrl(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withProtocol);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    if (hostname !== "linkedin.com" && !hostname.endsWith(".linkedin.com")) {
      return "";
    }
    return url.toString();
  } catch {
    return "";
  }
}

function textFromMeta(html: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i");
  return decodeEntities(html.match(re)?.[1] ?? "");
}

function decodeEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function pageLooksBlocked(status: number, html: string) {
  const lower = html.toLowerCase();
  return (
    status === 999 ||
    status === 403 ||
    status === 429 ||
    lower.includes("authwall") ||
    (lower.includes("login") && lower.includes("linkedin") && lower.length < 25000) ||
    lower.includes("captcha")
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Mangler auth" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) return json({ error: "Ikke autentisert" }, 401);

    const body = await req.json().catch(() => ({}));
    const url = normalizeLinkedInUrl(body.url);
    if (!url) return json({ status: "empty" satisfies LinkedInStatus, error: "LinkedIn-URL mangler eller er ugyldig" }, 400);

    await supabase.from("profiles").upsert(
      { user_id: user.id, email: user.email, linkedin_url: url },
      { onConflict: "user_id" },
    );

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    let resp: Response;
    try {
      resp = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 Jobbhjelpen/1.0",
          Accept: "text/html,application/xhtml+xml",
        },
      });
    } finally {
      clearTimeout(timeout);
    }

    const html = await resp.text();
    if (!resp.ok || pageLooksBlocked(resp.status, html)) {
      return json({
        status: "blocked" satisfies LinkedInStatus,
        url,
        hint:
          "LinkedIn blokkerte offentlig henting. URL-en er lagret og brukes som hint, men lim gjerne inn CV eller nøkkelpunkter for bedre treff.",
      });
    }

    const title =
      textFromMeta(html, "og:title") ||
      decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
    const description = textFromMeta(html, "og:description") || textFromMeta(html, "description");
    const cleanTitle = title.replace(/\s+\|\s+LinkedIn.*$/i, "").trim();
    const profileText = [cleanTitle, description].filter(Boolean).join("\n").slice(0, 1200);

    if (!profileText || profileText.length < 20) {
      return json({
        status: "empty" satisfies LinkedInStatus,
        url,
        hint:
          "LinkedIn-siden var tilgjengelig, men ga ikke nok offentlig tekst. URL-en er lagret som hint.",
      });
    }

    return json({
      status: "ok" satisfies LinkedInStatus,
      url,
      profile_text: profileText,
      extracted: {
        title: cleanTitle || null,
        description: description || null,
      },
      hint: "Offentlig LinkedIn-tekst er hentet som supplement. CV er fortsatt beste faktagrunnlag.",
    });
  } catch (e) {
    const message = e instanceof Error && e.name === "AbortError"
      ? "LinkedIn svarte ikke raskt nok."
      : e instanceof Error
      ? e.message
      : "Ukjent feil";
    console.error("import-linkedin error", e);
    return json({
      status: "error" satisfies LinkedInStatus,
      error: message,
      hint: "URL-en kan fortsatt brukes som manuelt hint i profilen.",
    });
  }
});
