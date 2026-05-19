import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, json, normalizeDeadline, stripHtml } from "../_shared/full-match.ts";
import { cleanupStaleJobs } from "../_shared/stale-jobs.ts";

const UA = "SoklyFullMatch/1.0";
const HTML_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

type FinnItem = {
  external_id: string;
  source_url: string;
  title: string;
  company?: string | null;
  location?: string | null;
  description?: string | null;
  deadline?: string | null;
  provider_updated_at?: string | null;
  raw_data?: Record<string, unknown>;
};

type HitLink = {
  user_id: string;
  source_suggestion_id?: string | null;
  rss_feed_id?: string | null;
  query: string;
  location?: string | null;
  rank?: number | null;
  score?: number | null;
  metadata?: Record<string, unknown>;
};

type LoadedFinnItems = {
  items: FinnItem[];
  linksByExternalId: Map<string, HitLink[]>;
  modes: string[];
  hints: string[];
  blocked: boolean;
};

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function pick(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = xml.match(re);
  if (!m) return null;
  return m[1].trim().replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");
}

function pickAttr(xml: string, tag: string, attr: string): string | null {
  const re = new RegExp(`<${tag}[^>]*${attr}=["']([^"']+)["']`, "i");
  return xml.match(re)?.[1] ?? null;
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function isoDateTime(value?: string | null) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function finnBlockedHint(status: number, query?: string | null, location?: string | null) {
  const search = [query?.trim(), location?.trim()].filter(Boolean).join(" ");
  return `Finn HTML fallback ble blokkert (HTTP ${status}). Bruk RSS-lenke fra lagret Finn-søk${search ? ` for "${search}"` : ""}, eller sett opp partner-API.`;
}

function buildFinnSearchUrl(query: string, location?: string | null) {
  const params = new URLSearchParams();
  params.set("q", query.trim());
  if (location?.trim()) params.set("location", location.trim());
  return `https://www.finn.no/job/search?${params.toString()}`;
}

function externalIdFromFinnLink(guid: string, link: string) {
  const id = link.match(/\/job\/ad\/(\d+)/i)?.[1];
  return id ? `finn-${id}` : guid || link;
}

function addLink(links: Map<string, HitLink[]>, externalId: string, link: HitLink) {
  const existing = links.get(externalId) ?? [];
  existing.push(link);
  links.set(externalId, existing);
}

function parseRss(xml: string, sourceUrl: string): FinnItem[] {
  const nodes = xml.match(/<(item|entry)[\s\S]*?<\/(item|entry)>/gi) ?? [];
  return nodes.flatMap((node) => {
    const title = stripHtml(pick(node, "title"));
    const link = pickAttr(node, "link", "href") ?? stripHtml(pick(node, "link")) ?? "";
    if (!title || !link) return [];
    const guid = stripHtml(pick(node, "guid") ?? pick(node, "id") ?? link);
    const description = stripHtml(pick(node, "description") ?? pick(node, "summary") ?? pick(node, "content") ?? "");
    const company = stripHtml(pick(node, "author") ?? "") || null;
    const published = pick(node, "pubDate") ?? pick(node, "published") ?? pick(node, "updated") ?? null;
    return [{
      external_id: externalIdFromFinnLink(guid, link),
      source_url: link,
      title,
      company,
      location: null,
      description,
      deadline: null,
      provider_updated_at: isoDateTime(published),
      raw_data: { rss_source: sourceUrl, guid, title, link, published },
    }];
  });
}

function parseFinnSearchHtml(html: string, sourceUrl: string, maxHits: number): FinnItem[] {
  const articleRe = /<article\b[^>]*>([\s\S]*?)<\/article>/gi;
  const hits: FinnItem[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;

  while ((m = articleRe.exec(html)) !== null && hits.length < maxHits) {
    const block = m[1];
    const linkMatch = block.match(/href=["']((?:https:\/\/www\.finn\.no)?\/job\/ad\/(\d+)[^"']*)["']/i);
    if (!linkMatch) continue;
    const id = linkMatch[2];
    if (seen.has(id)) continue;
    seen.add(id);

    const href = linkMatch[1].startsWith("http") ? linkMatch[1] : `https://www.finn.no${linkMatch[1]}`;
    const anchorMatch = block.match(/<a[^>]+class=["'][^"']*job-card-link[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);
    const ariaTitle = block.match(/<a[^>]+aria-label=["']([^"']+)["'][^>]*>/i)?.[1] ?? "";
    const title = decodeHtml(
      anchorMatch
        ? anchorMatch[1].replace(/<[^>]+>/g, " ")
        : ariaTitle,
    ) || "Finn-stilling";
    const company = decodeHtml(block.match(/<strong[^>]*>([^<]{1,180})<\/strong>/i)?.[1] ?? "") || null;
    const published = block.match(/<time[^>]+datetime=["']([^"']+)["'][^>]*>/i)?.[1] ?? null;

    hits.push({
      external_id: `finn-${id}`,
      source_url: href,
      title: title.slice(0, 240),
      company,
      location: null,
      description: company ? company : null,
      provider_updated_at: isoDateTime(published),
      raw_data: { html_source: sourceUrl, finn_id: id, published },
    });
  }

  return hits;
}

function normalizeFinnApiPayload(data: any): FinnItem[] {
  const candidates = Array.isArray(data)
    ? data
    : Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data?.ads)
    ? data.ads
    : Array.isArray(data?.results)
    ? data.results
    : [];

  return candidates.flatMap((item: any) => {
    const id = item.id ?? item.ad_id ?? item.adId ?? item.uuid ?? item.url;
    const url = item.url ?? item.ad_url ?? item.webUrl ?? item.links?.self;
    const title = item.title ?? item.heading ?? item.name;
    if (!id || !url || !title) return [];
    return [{
      external_id: String(id).startsWith("finn-") ? String(id) : `finn-${id}`,
      source_url: String(url),
      title: String(title),
      company: item.company?.name ?? item.employer?.name ?? item.company_name ?? null,
      location: item.location?.name ?? item.location ?? item.area ?? null,
      description: stripHtml(item.description ?? item.body ?? item.text ?? ""),
      deadline: normalizeDeadline(item.deadline ?? item.application_deadline ?? item.expires),
      provider_updated_at: isoDateTime(item.updated_at ?? item.updated ?? item.published_at ?? item.published),
      raw_data: item,
    }];
  });
}

async function fetchRss(url: string) {
  const resp = await fetch(url, {
    headers: {
      Accept: "application/rss+xml,application/xml,text/xml,*/*",
      "User-Agent": UA,
    },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return parseRss(await resp.text(), url);
}

async function recordSourceHit(admin: any, row: Record<string, unknown>) {
  if (!row.source_suggestion_id && !row.rss_feed_id) return;

  let existingQuery = admin
    .from("source_suggestion_hits")
    .select("id")
    .eq("user_id", row.user_id)
    .eq("external_job_id", row.external_job_id);

  if (row.source_suggestion_id) existingQuery = existingQuery.eq("source_suggestion_id", row.source_suggestion_id);
  if (row.rss_feed_id) existingQuery = existingQuery.eq("rss_feed_id", row.rss_feed_id);

  const { data: existing } = await existingQuery.maybeSingle();
  if (existing?.id) {
    const { error } = await admin.from("source_suggestion_hits").update(row).eq("id", existing.id);
    if (error) console.error("Finn source hit update failed", error.message);
    return;
  }

  const { error } = await admin.from("source_suggestion_hits").insert(row);
  if (error && error.code !== "23505") console.error("Finn source hit insert failed", error.message);
}

async function loadFinnItems(body: any, admin: any): Promise<LoadedFinnItems> {
  const loaded: LoadedFinnItems = {
    items: [],
    linksByExternalId: new Map(),
    modes: [],
    hints: [],
    blocked: false,
  };
  const maxSuggestionsPerUser = clampInt(body.maxSuggestionsPerUser, 3, 1, 20);
  const maxHitsPerSuggestion = clampInt(body.maxHitsPerSuggestion, 10, 1, 30);

  if (typeof body.rssUrl === "string" && body.rssUrl.trim()) {
    const rssUrl = body.rssUrl.trim();
    loaded.items.push(...await fetchRss(rssUrl));
    loaded.modes.push("rss_url");
  }

  if (body.includeUserFeeds) {
    let q = admin.from("rss_feeds").select("id,name,url,user_id,items_found").eq("is_active", true).ilike("url", "%finn.no%");
    if (typeof body.userId === "string") q = q.eq("user_id", body.userId);
    const { data: feeds, error } = await q;
    if (error) throw error;

    let suggestionsQ = admin
      .from("source_suggestions")
      .select("id,name,query,location,rss_url,user_id")
      .eq("provider", "finn")
      .eq("is_active", true)
      .neq("status", "dismissed")
      .not("rss_url", "is", null);
    if (typeof body.userId === "string") suggestionsQ = suggestionsQ.eq("user_id", body.userId);
    const { data: suggestions, error: suggestionsErr } = await suggestionsQ;
    if (suggestionsErr) throw suggestionsErr;

    for (const feed of feeds ?? []) {
      try {
        const items = await fetchRss(feed.url);
        items.forEach((item, index) => {
          addLink(loaded.linksByExternalId, item.external_id, {
            user_id: feed.user_id,
            rss_feed_id: feed.id,
            query: feed.name ?? "Finn RSS",
            location: null,
            rank: index + 1,
            metadata: { source: "rss_feed", feedName: feed.name, feedUrl: feed.url },
          });
        });
        loaded.items.push(...items);
        await admin.from("rss_feeds").update({
          last_checked_at: new Date().toISOString(),
          last_error: null,
          items_found: (feed.items_found ?? 0) + items.length,
        }).eq("id", feed.id);
      } catch (e) {
        const message = (e as Error).message;
        loaded.hints.push(`Finn RSS "${feed.name}" feilet: ${message}`);
        await admin.from("rss_feeds").update({
          last_checked_at: new Date().toISOString(),
          last_error: message,
        }).eq("id", feed.id);
      }
    }

    for (const suggestion of suggestions ?? []) {
      try {
        const items = await fetchRss(suggestion.rss_url);
        items.forEach((item, index) => {
          addLink(loaded.linksByExternalId, item.external_id, {
            user_id: suggestion.user_id,
            source_suggestion_id: suggestion.id,
            query: suggestion.query,
            location: suggestion.location ?? null,
            rank: index + 1,
            metadata: { source: "source_suggestion_rss", suggestionName: suggestion.name, rssUrl: suggestion.rss_url },
          });
        });
        loaded.items.push(...items);
      } catch (e) {
        loaded.hints.push(`Finn RSS-forslag "${suggestion.name}" feilet: ${(e as Error).message}`);
      }
    }

    if ((feeds?.length ?? 0) > 0 || (suggestions?.length ?? 0) > 0) loaded.modes.push("user_rss_feeds");
  }

  const endpoint = Deno.env.get("FINN_API_ENDPOINT");
  const key = Deno.env.get("FINN_API_KEY");
  if (endpoint && key && body.includeOfficialApi === true) {
    const resp = await fetch(endpoint, {
      headers: {
        Accept: "application/json",
        "x-FINN-apikey": key,
        Authorization: `Bearer ${key}`,
        "User-Agent": UA,
      },
    });
    if (!resp.ok) throw new Error(`Finn API svarte HTTP ${resp.status}`);
    loaded.items.push(...normalizeFinnApiPayload(await resp.json()));
    loaded.modes.push("official_api");
  }

  if (body.includeHtmlSuggestions) {
    const enabledByEnv = (Deno.env.get("FINN_HTML_FALLBACK_ENABLED") ?? "").toLowerCase() === "true";
    const enabledForUserRun = typeof body.userId === "string" && body.userId.trim().length > 0;
    const enabled = enabledByEnv || enabledForUserRun;
    if (!enabled) {
      loaded.hints.push("Finn HTML fallback er av for planlagt bred kjøring. Sett FINN_HTML_FALLBACK_ENABLED=true for kontrollert daglig fallback, eller kjør for én innlogget bruker.");
    } else {
      let suggestionsQ = admin
        .from("source_suggestions")
        .select("id,name,query,location,search_url,user_id,confidence")
        .eq("provider", "finn")
        .eq("is_active", true)
        .neq("status", "dismissed")
        .order("confidence", { ascending: false });
      if (typeof body.userId === "string") suggestionsQ = suggestionsQ.eq("user_id", body.userId);
      const { data: suggestions, error } = await suggestionsQ;
      if (error) throw error;

      const perUser = new Map<string, number>();
      const selected = (suggestions ?? []).filter((suggestion: any) => {
        const count = perUser.get(suggestion.user_id) ?? 0;
        if (count >= maxSuggestionsPerUser) return false;
        perUser.set(suggestion.user_id, count + 1);
        return true;
      });

      for (const suggestion of selected) {
        const searchUrl = suggestion.search_url || buildFinnSearchUrl(suggestion.query, suggestion.location);
        try {
          const resp = await fetch(searchUrl, {
            redirect: "follow",
            headers: {
              "User-Agent": HTML_UA,
              Accept: "text/html,application/xhtml+xml",
              "Accept-Language": "nb-NO,nb;q=0.9,en;q=0.8",
            },
          });
          if (resp.status === 403 || resp.status === 429 || resp.status === 503) {
            loaded.blocked = true;
            loaded.hints.push(finnBlockedHint(resp.status, suggestion.query, suggestion.location));
            continue;
          }
          if (!resp.ok) {
            loaded.hints.push(`Finn HTML-søk "${suggestion.name}" feilet: HTTP ${resp.status}`);
            continue;
          }
          const items = parseFinnSearchHtml(await resp.text(), searchUrl, maxHitsPerSuggestion);
          if (items.length === 0) {
            loaded.hints.push(`Finn HTML-søk "${suggestion.name}" ga ingen lesbare treff. Formatet kan være endret eller blokkert.`);
            continue;
          }
          items.forEach((item, index) => {
            addLink(loaded.linksByExternalId, item.external_id, {
              user_id: suggestion.user_id,
              source_suggestion_id: suggestion.id,
              query: suggestion.query,
              location: suggestion.location ?? null,
              rank: index + 1,
              score: suggestion.confidence ?? null,
              metadata: { source: "html_suggestion", suggestionName: suggestion.name, searchUrl },
            });
          });
          loaded.items.push(...items);
        } catch (e) {
          loaded.hints.push(`Finn HTML-søk "${suggestion.name}" feilet: ${(e as Error).message}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }

      if (selected.length > 0) loaded.modes.push("html_suggestions");
    }
  }

  if (loaded.items.length === 0 && loaded.modes.length === 0) {
    loaded.modes.push("not_configured");
    loaded.hints.push("Finn bred ingest krever RSS, partner-API eller kontrollert HTML fallback.");
  }

  return loaded;
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

  try {
    const { items, linksByExternalId, modes, hints, blocked } = await loadFinnItems(body, admin);
    let upserted = 0;
    let skipped = 0;
    let linksRecorded = 0;
    const seen = new Set<string>();

    for (const item of items) {
      const dedupeKey = item.external_id;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      const { data: saved, error } = await admin
        .from("external_jobs")
        .upsert(
          {
            provider: "finn",
            external_id: item.external_id,
            source_url: item.source_url,
            title: item.title || "Finn-stilling",
            company: item.company ?? null,
            location: item.location ?? null,
            description: item.description ?? null,
            deadline: normalizeDeadline(item.deadline ?? null),
            status: "active",
            raw_data: item.raw_data ?? item,
            provider_updated_at: item.provider_updated_at ?? null,
            fetched_at: startedAt.toISOString(),
            last_seen_at: startedAt.toISOString(),
          },
          { onConflict: "provider,external_id" },
        )
        .select("id")
        .maybeSingle();
      if (error || !saved?.id) {
        skipped++;
        console.error("Finn item upsert failed", item.source_url, error?.message ?? "missing id");
        continue;
      }

      upserted++;
      for (const link of linksByExternalId.get(item.external_id) ?? []) {
        await recordSourceHit(admin, {
          user_id: link.user_id,
          source_suggestion_id: link.source_suggestion_id ?? null,
          rss_feed_id: link.rss_feed_id ?? null,
          external_job_id: saved.id,
          provider: "finn",
          query: link.query,
          location: link.location ?? null,
          rank: link.rank ?? null,
          score: link.score ?? null,
          metadata: link.metadata ?? {},
          found_at: startedAt.toISOString(),
        });
        linksRecorded++;
      }
    }

    const cleanup = await cleanupStaleJobs(admin);
    const inactiveExpired = cleanup.externalExpiredInactivated + cleanup.externalStaleInactivated;

    const hint = hints.length > 0 ? hints.join(" ") : null;
    const status = blocked ? "blocked" : hint && upserted === 0 ? "needs_access" : hint ? "partial" : "ok";
    await admin.from("source_ingest_state").upsert(
      {
        provider: "finn",
        last_checked_at: startedAt.toISOString(),
        last_status: status,
        last_error: hint,
        last_run_stats: {
          modes,
          fetched: items.length,
          upserted,
          skipped,
          linksRecorded,
          inactiveExpired,
          cleanup,
          blocked,
        },
      },
      { onConflict: "provider" },
    );

    return json({
      ok: status === "ok" || status === "partial",
      provider: "finn",
      mode: modes.join("+"),
      fetched: items.length,
      upserted,
      skipped,
      linksRecorded,
      inactiveExpired,
      cleanup,
      hint,
      blocked,
    });
  } catch (e) {
    const message = (e as Error).message;
    await admin.from("source_ingest_state").upsert(
      {
        provider: "finn",
        last_checked_at: startedAt.toISOString(),
        last_status: "error",
        last_error: message,
        last_run_stats: {},
      },
      { onConflict: "provider" },
    );
    console.error("ingest-finn error", e);
    return json({ error: message }, 500);
  }
});
