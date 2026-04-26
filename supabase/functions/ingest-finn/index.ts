import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, json, normalizeDeadline, stripHtml } from "../_shared/full-match.ts";

type FinnItem = {
  external_id: string;
  source_url: string;
  title: string;
  company?: string | null;
  location?: string | null;
  description?: string | null;
  deadline?: string | null;
  raw_data?: Record<string, unknown>;
};

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

function parseRss(xml: string, sourceUrl: string): FinnItem[] {
  const nodes = xml.match(/<(item|entry)[\s\S]*?<\/(item|entry)>/gi) ?? [];
  return nodes.flatMap((node) => {
    const title = stripHtml(pick(node, "title"));
    const link = pickAttr(node, "link", "href") ?? stripHtml(pick(node, "link")) ?? "";
    if (!title || !link) return [];
    const guid = stripHtml(pick(node, "guid") ?? pick(node, "id") ?? link);
    const description = stripHtml(pick(node, "description") ?? pick(node, "summary") ?? pick(node, "content") ?? "");
    const company = stripHtml(pick(node, "author") ?? "") || null;
    return [{
      external_id: guid || link,
      source_url: link,
      title,
      company,
      location: null,
      description,
      deadline: null,
      raw_data: { rss_source: sourceUrl, guid, title, link },
    }];
  });
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
      external_id: String(id),
      source_url: String(url),
      title: String(title),
      company: item.company?.name ?? item.employer?.name ?? item.company_name ?? null,
      location: item.location?.name ?? item.location ?? item.area ?? null,
      description: stripHtml(item.description ?? item.body ?? item.text ?? ""),
      deadline: normalizeDeadline(item.deadline ?? item.application_deadline ?? item.expires),
      raw_data: item,
    }];
  });
}

async function loadFinnItems(body: any, admin: any): Promise<{ items: FinnItem[]; mode: string; hint?: string }> {
  if (typeof body.rssUrl === "string" && body.rssUrl.trim()) {
    const rssUrl = body.rssUrl.trim();
    const resp = await fetch(rssUrl, {
      headers: {
        Accept: "application/rss+xml,application/xml,text/xml,*/*",
        "User-Agent": "RecruitBuddyFullMatch/1.0",
      },
    });
    if (!resp.ok) throw new Error(`Finn RSS svarte HTTP ${resp.status}`);
    return { items: parseRss(await resp.text(), rssUrl), mode: "rss_url" };
  }

  if (body.includeUserFeeds) {
    let q = admin.from("rss_feeds").select("id,name,url,user_id").eq("is_active", true).ilike("url", "%finn.no%");
    if (typeof body.userId === "string") q = q.eq("user_id", body.userId);
    const { data: feeds, error } = await q;
    if (error) throw error;
    let suggestionsQ = admin
      .from("source_suggestions")
      .select("id,name,rss_url,user_id")
      .eq("provider", "finn")
      .eq("is_active", true)
      .not("rss_url", "is", null);
    if (typeof body.userId === "string") suggestionsQ = suggestionsQ.eq("user_id", body.userId);
    const { data: suggestions } = await suggestionsQ;
    const all: FinnItem[] = [];
    const sources = [
      ...(feeds ?? []).map((feed: any) => ({ name: feed.name, url: feed.url })),
      ...(suggestions ?? []).map((suggestion: any) => ({ name: suggestion.name, url: suggestion.rss_url })),
    ].filter((source) => source.url);
    for (const feed of sources) {
      try {
        const resp = await fetch(feed.url, {
          headers: {
            Accept: "application/rss+xml,application/xml,text/xml,*/*",
            "User-Agent": "RecruitBuddyFullMatch/1.0",
          },
        });
        if (!resp.ok) continue;
        all.push(...parseRss(await resp.text(), feed.url));
      } catch (e) {
        console.error("Finn RSS fallback failed", feed.url, (e as Error).message);
      }
    }
    return { items: all, mode: "user_rss_feeds" };
  }

  const endpoint = Deno.env.get("FINN_API_ENDPOINT");
  const key = Deno.env.get("FINN_API_KEY");
  if (endpoint && key) {
    const resp = await fetch(endpoint, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${key}`,
        "User-Agent": "RecruitBuddyFullMatch/1.0",
      },
    });
    if (!resp.ok) throw new Error(`Finn API svarte HTTP ${resp.status}`);
    return { items: normalizeFinnApiPayload(await resp.json()), mode: "official_api" };
  }

  return {
    items: [],
    mode: "not_configured",
    hint: "Finn bred ingest krever offisiell API-/partner-tilgang. Bruk rssUrl/includeUserFeeds som fallback.",
  };
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
    const { items, mode, hint } = await loadFinnItems(body, admin);
    let upserted = 0;
    let skipped = 0;

    for (const item of items) {
      const { error } = await admin
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
            fetched_at: startedAt.toISOString(),
            last_seen_at: startedAt.toISOString(),
          },
          { onConflict: "provider,external_id" },
        );
      if (error) {
        skipped++;
        console.error("Finn item upsert failed", item.source_url, error.message);
      } else {
        upserted++;
      }
    }

    const status = hint ? "needs_access" : "ok";
    await admin.from("source_ingest_state").upsert(
      {
        provider: "finn",
        last_checked_at: startedAt.toISOString(),
        last_status: status,
        last_error: hint ?? null,
        last_run_stats: { mode, fetched: items.length, upserted, skipped },
      },
      { onConflict: "provider" },
    );

    return json({ ok: !hint, provider: "finn", mode, fetched: items.length, upserted, skipped, hint });
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
