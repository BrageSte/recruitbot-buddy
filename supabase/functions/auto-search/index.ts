import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Source = "finn" | "arbeidsplassen" | "linkedin";

type Hit = {
  external_id: string;
  url: string;
  title: string;
  company?: string | null;
  location?: string | null;
  description?: string | null;
};

type SearchResult =
  | { ok: true; hits: Hit[] }
  | { ok: false; status: "blocked" | "error"; error: string; hint?: string };

const UA = "Mozilla/5.0 (compatible; JobHunterAI/1.0; +https://lovable.app)";

function buildUrl(source: Source, query: string, location: string | null): string {
  const q = encodeURIComponent(query.trim());
  const loc = location ? encodeURIComponent(location.trim()) : "";
  switch (source) {
    case "finn":
      // Finn job search page
      return `https://www.finn.no/job/fulltime/search.html?q=${q}${loc ? `&location=${loc}` : ""}`;
    case "arbeidsplassen":
      // Arbeidsplassen (NAV) public search
      return `https://arbeidsplassen.nav.no/stillinger?q=${q}${loc ? `&counties=${loc}` : ""}`;
    case "linkedin":
      return `https://www.linkedin.com/jobs/search/?keywords=${q}${loc ? `&location=${loc}` : ""}`;
  }
}

function blockedHint(source: Source, query: string, location: string | null): string {
  const q = query.trim();
  const loc = location?.trim() ?? "";
  switch (source) {
    case "finn":
      return `Finn.no blokkerer automatisk skraping. Manuell oppskrift:\n1) Gå til finn.no/job, søk etter "${q}"${loc ? ` i ${loc}` : ""}.\n2) Klikk "Lagre søk".\n3) Under "Mine sider → Lagrede søk", kopier RSS-lenken.\n4) Lim inn på Kilder-siden i denne appen.`;
    case "linkedin":
      return `LinkedIn krever innlogging og blokkerer scraping. Anbefalt: opprett et "Job alert" på LinkedIn → få e-post → videresend e-postvarslene til denne appen (kommer snart), eller lim inn enkeltjobber via "Ny jobb → URL".`;
    case "arbeidsplassen":
      return `Arbeidsplassen (NAV) svarte ikke. Prøv igjen senere, eller bruk det offentlige API-et på arbeidsplassen.nav.no/stillinger og lim inn URL-er manuelt.`;
  }
}

async function searchArbeidsplassen(query: string, location: string | null): Promise<SearchResult> {
  // NAV has a public search API
  try {
    const params = new URLSearchParams({ q: query, size: "20" });
    if (location) params.append("counties", location.toUpperCase());
    const url = `https://arbeidsplassen.nav.no/public-feed/api/v1/ads?${params}`;
    const resp = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (resp.status === 403 || resp.status === 429) {
      return { ok: false, status: "blocked", error: `HTTP ${resp.status}`, hint: blockedHint("arbeidsplassen", query, location) };
    }
    if (!resp.ok) return { ok: false, status: "error", error: `HTTP ${resp.status}` };
    const data = await resp.json();
    const items = (data?.content ?? data?._embedded?.ads ?? []) as any[];
    const hits: Hit[] = items.slice(0, 20).map((it) => ({
      external_id: String(it.uuid ?? it.id ?? it.reference ?? crypto.randomUUID()),
      url: it.source_url ?? it._links?.self?.href ?? `https://arbeidsplassen.nav.no/stillinger/stilling/${it.uuid ?? ""}`,
      title: it.title ?? "Uten tittel",
      company: it.employer?.name ?? it.business_name ?? null,
      location: it.locations?.[0]?.city ?? it.locations?.[0]?.county ?? null,
      description: it.description ?? null,
    }));
    return { ok: true, hits };
  } catch (e) {
    return { ok: false, status: "error", error: (e as Error).message };
  }
}

async function searchFinnHtml(query: string, location: string | null): Promise<SearchResult> {
  try {
    const url = buildUrl("finn", query, location);
    const resp = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" } });
    if (resp.status === 403 || resp.status === 429 || resp.status === 503) {
      return { ok: false, status: "blocked", error: `HTTP ${resp.status}`, hint: blockedHint("finn", query, location) };
    }
    if (!resp.ok) return { ok: false, status: "error", error: `HTTP ${resp.status}` };
    const html = await resp.text();
    // Finn uses SSR; pull out job ad links + titles. Best-effort regex.
    const linkRe = /<a[^>]+href="(https?:\/\/www\.finn\.no\/job\/[^"]+\/ad\.html\?finnkode=\d+)"[^>]*>([\s\S]*?)<\/a>/g;
    const seen = new Set<string>();
    const hits: Hit[] = [];
    let m: RegExpExecArray | null;
    while ((m = linkRe.exec(html)) !== null && hits.length < 20) {
      const href = m[1];
      const code = href.match(/finnkode=(\d+)/)?.[1];
      if (!code || seen.has(code)) continue;
      seen.add(code);
      const text = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
      if (!text) continue;
      hits.push({ external_id: `finn-${code}`, url: href, title: text });
    }
    if (hits.length === 0) {
      return { ok: false, status: "blocked", error: "Ingen treff i HTML – sannsynligvis blokkert eller endret markup", hint: blockedHint("finn", query, location) };
    }
    return { ok: true, hits };
  } catch (e) {
    return { ok: false, status: "error", error: (e as Error).message };
  }
}

async function searchLinkedIn(query: string, location: string | null): Promise<SearchResult> {
  // LinkedIn aggressively blocks. Always return a hint.
  return {
    ok: false,
    status: "blocked",
    error: "LinkedIn krever innlogging",
    hint: blockedHint("linkedin", query, location),
  };
}

async function runSearch(source: Source, query: string, location: string | null): Promise<SearchResult> {
  if (source === "arbeidsplassen") return searchArbeidsplassen(query, location);
  if (source === "finn") return searchFinnHtml(query, location);
  return searchLinkedIn(query, location);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Mangler auth" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) return json({ error: "Ikke autentisert" }, 401);

    const body = await req.json().catch(() => ({}));
    const { searchId, userId } = body as { searchId?: string; userId?: string };

    let q = supabase.from("auto_searches").select("*").eq("user_id", user.id).eq("is_active", true);
    if (searchId) q = q.eq("id", searchId);
    const { data: searches, error } = await q;
    if (error) return json({ error: error.message }, 500);

    let totalHits = 0;
    let totalNew = 0;
    const results: any[] = [];

    for (const s of searches ?? []) {
      const result = await runSearch(s.source as Source, s.query, s.location);
      const updates: Record<string, unknown> = {
        last_checked_at: new Date().toISOString(),
      };

      if (!result.ok) {
        updates.last_status = result.status;
        updates.last_error = result.error;
        updates.blocked_hint = result.hint ?? null;
        await supabase.from("auto_searches").update(updates).eq("id", s.id);
        results.push({ id: s.id, name: s.name, status: result.status, error: result.error });
        continue;
      }

      // Insert new jobs (skip duplicates by source_url)
      let newCount = 0;
      for (const hit of result.hits) {
        const { data: existing } = await supabase
          .from("jobs")
          .select("id")
          .eq("user_id", user.id)
          .eq("source_url", hit.url)
          .maybeSingle();
        if (existing) continue;

        const { error: insErr } = await supabase.from("jobs").insert({
          user_id: user.id,
          title: hit.title,
          company: hit.company ?? null,
          location: hit.location ?? null,
          source: s.source === "linkedin" ? "linkedin" : ("rss" as const),
          source_url: hit.url,
          description: hit.description ?? null,
          status: "discovered" as const,
          ai_summary: `Funnet via auto-søk: ${s.name}`,
        });
        if (!insErr) newCount++;
      }

      totalHits += result.hits.length;
      totalNew += newCount;
      updates.last_status = "ok";
      updates.last_error = null;
      updates.blocked_hint = null;
      updates.items_found = (s.items_found ?? 0) + newCount;
      await supabase.from("auto_searches").update(updates).eq("id", s.id);
      results.push({ id: s.id, name: s.name, status: "ok", hits: result.hits.length, new: newCount });
    }

    return json({ searches: searches?.length ?? 0, totalHits, newJobs: totalNew, results });
  } catch (e) {
    console.error("auto-search error", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
