import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, json, normalizeDeadline, stripHtml } from "../_shared/full-match.ts";

const FEED_BASE = "https://pam-stilling-feed.nav.no";

type FeedItem = {
  id: string;
  url: string;
  title: string;
  date_modified?: string;
  _feed_entry?: {
    uuid?: string;
    status?: "ACTIVE" | "INACTIVE";
    title?: string;
    businessName?: string;
    municipal?: string;
    sistEndret?: string;
  };
};

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function absoluteUrl(path: string) {
  if (path.startsWith("http")) return path;
  return `${FEED_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

async function getFeedToken(): Promise<string> {
  const configured = Deno.env.get("ARBEIDSPLASSEN_FEED_TOKEN");
  if (configured) return configured.trim();

  const resp = await fetch(`${FEED_BASE}/api/publicToken`, { headers: { Accept: "text/plain" } });
  if (!resp.ok) throw new Error(`Kunne ikke hente NAV feed-token: HTTP ${resp.status}`);
  const text = await resp.text();
  const token = text.match(/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0];
  if (!token) throw new Error("NAV publicToken-response manglet JWT");
  return token;
}

async function fetchJson(url: string, token: string, since?: string | null) {
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
    "User-Agent": "RecruitBuddyFullMatch/1.0",
  };
  if (since) headers["If-Modified-Since"] = since;
  const resp = await fetch(url, { headers });
  if (resp.status === 304) return null;
  if (!resp.ok) throw new Error(`NAV feed svarte HTTP ${resp.status}`);
  return await resp.json();
}

function locationFromAd(ad: any, fallback?: string | null) {
  const locations = Array.isArray(ad?.workLocations) ? ad.workLocations : [];
  const formatted = locations
    .map((l: any) => [l.city, l.municipal, l.county].filter(Boolean).join(", "))
    .filter(Boolean);
  return formatted[0] ?? fallback ?? null;
}

function titleFromAd(ad: any, fallback: string) {
  return (ad?.title || ad?.jobtitle || fallback || "Uten tittel").toString().trim();
}

function sourceUrlFromAd(ad: any, uuid: string) {
  return ad?.link || `https://arbeidsplassen.nav.no/stillinger/stilling/${uuid}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const startedAt = new Date();
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const maxPages = clampInt(body.maxPages, 5, 1, 50);
  const maxItems = clampInt(body.maxItems, 250, 1, 1500);
  const sinceDays = clampInt(body.sinceDays, 14, 1, 185);
  const explicitSince = typeof body.since === "string" ? body.since : null;

  const stats = {
    pages: 0,
    seen: 0,
    activeUpserted: 0,
    inactiveUpdated: 0,
    skipped: 0,
    errors: 0,
  };

  try {
    const { data: state } = await admin
      .from("source_ingest_state")
      .select("*")
      .eq("provider", "arbeidsplassen")
      .maybeSingle();

    const sinceDate = explicitSince
      ? new Date(explicitSince)
      : state?.last_modified_at
      ? new Date(state.last_modified_at)
      : new Date(Date.now() - sinceDays * 86400000);
    const sinceHeader = Number.isNaN(sinceDate.getTime()) ? null : sinceDate.toUTCString();

    const token = await getFeedToken();
    let feedUrl = `${FEED_BASE}/api/v1/feed`;
    let lastFeedUrl: string | null = null;
    let newestModified: string | null = state?.last_modified_at ?? null;
    const processed = new Set<string>();

    while (feedUrl && stats.pages < maxPages && stats.seen < maxItems) {
      const page = await fetchJson(feedUrl, token, sinceHeader);
      if (!page) break;
      stats.pages++;
      lastFeedUrl = page.feed_url ?? feedUrl;

      const items = (page.items ?? []) as FeedItem[];
      for (const item of items) {
        if (stats.seen >= maxItems) break;
        const uuid = item._feed_entry?.uuid ?? item.id;
        if (!uuid || processed.has(`${uuid}:${item._feed_entry?.status ?? ""}:${item.date_modified ?? ""}`)) continue;
        processed.add(`${uuid}:${item._feed_entry?.status ?? ""}:${item.date_modified ?? ""}`);
        stats.seen++;

        const modified = item._feed_entry?.sistEndret ?? item.date_modified ?? null;
        if (modified && (!newestModified || new Date(modified) > new Date(newestModified))) {
          newestModified = modified;
        }

        try {
          if (item._feed_entry?.status !== "ACTIVE") {
            const { error } = await admin
              .from("external_jobs")
              .upsert(
                {
                  provider: "arbeidsplassen",
                  external_id: uuid,
                  title: item._feed_entry?.title ?? item.title ?? "Inaktiv stilling",
                  company: item._feed_entry?.businessName ?? null,
                  location: item._feed_entry?.municipal ?? null,
                  status: "inactive",
                  raw_data: { feed_entry: item._feed_entry ?? item },
                  provider_updated_at: modified,
                  fetched_at: startedAt.toISOString(),
                  last_seen_at: startedAt.toISOString(),
                },
                { onConflict: "provider,external_id" },
              );
            if (error) throw error;
            stats.inactiveUpdated++;
            continue;
          }

          const detail = await fetchJson(absoluteUrl(item.url), token);
          const ad = detail?.ad_content;
          if (!ad || detail?.status !== "ACTIVE") {
            const { error } = await admin
              .from("external_jobs")
              .upsert(
                {
                  provider: "arbeidsplassen",
                  external_id: uuid,
                  title: item._feed_entry?.title ?? item.title ?? "Inaktiv stilling",
                  company: item._feed_entry?.businessName ?? null,
                  location: item._feed_entry?.municipal ?? null,
                  status: "inactive",
                  raw_data: detail ?? { feed_entry: item._feed_entry ?? item },
                  provider_updated_at: detail?.sistEndret ?? modified,
                  fetched_at: startedAt.toISOString(),
                  last_seen_at: startedAt.toISOString(),
                },
                { onConflict: "provider,external_id" },
              );
            if (error) throw error;
            stats.inactiveUpdated++;
            continue;
          }

          const description = [
            stripHtml(ad.description),
            ad.employer?.description ? `\n\nOm arbeidsgiver:\n${stripHtml(ad.employer.description)}` : "",
          ].join("").trim();

          const { error } = await admin
            .from("external_jobs")
            .upsert(
              {
                provider: "arbeidsplassen",
                external_id: uuid,
                source_url: sourceUrlFromAd(ad, uuid),
                title: titleFromAd(ad, item.title),
                company: ad.employer?.name ?? item._feed_entry?.businessName ?? null,
                location: locationFromAd(ad, item._feed_entry?.municipal ?? null),
                description,
                deadline: normalizeDeadline(ad.applicationDue ?? ad.expires),
                status: "active",
                raw_data: detail,
                provider_updated_at: detail?.sistEndret ?? ad.updated ?? modified,
                fetched_at: startedAt.toISOString(),
                last_seen_at: startedAt.toISOString(),
              },
              { onConflict: "provider,external_id" },
            );
          if (error) throw error;
          stats.activeUpserted++;
        } catch (e) {
          stats.errors++;
          console.error("Arbeidsplassen item failed", uuid, (e as Error).message);
        }
      }

      feedUrl = page.next_url ? absoluteUrl(page.next_url) : "";
    }

    await admin.from("source_ingest_state").upsert(
      {
        provider: "arbeidsplassen",
        last_checked_at: startedAt.toISOString(),
        last_modified_at: newestModified,
        last_feed_url: lastFeedUrl,
        last_status: stats.errors > 0 ? "partial" : "ok",
        last_error: stats.errors > 0 ? `${stats.errors} annonser feilet under ingest.` : null,
        last_run_stats: stats,
      },
      { onConflict: "provider" },
    );

    return json({ ok: true, provider: "arbeidsplassen", ...stats, lastModifiedAt: newestModified });
  } catch (e) {
    const message = (e as Error).message;
    await admin.from("source_ingest_state").upsert(
      {
        provider: "arbeidsplassen",
        last_checked_at: startedAt.toISOString(),
        last_status: "error",
        last_error: message,
        last_run_stats: stats,
      },
      { onConflict: "provider" },
    );
    console.error("ingest-arbeidsplassen-feed error", e);
    return json({ error: message, ...stats }, 500);
  }
});
