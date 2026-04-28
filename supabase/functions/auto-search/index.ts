import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { aiParse, fetchJobText, weightedScore } from "./enrich.ts";
import { searchArbeidsplassenJobs } from "../_shared/nav-search.ts";

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

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function blockedHint(source: Source, query: string, location: string | null): string {
  const q = query.trim();
  const loc = location?.trim() ?? "";
  switch (source) {
    case "finn":
      return `Finn.no blokkerte automatisk skraping. Manuell oppskrift:\n1) Gå til finn.no/job, søk etter "${q}"${loc ? ` i ${loc}` : ""}.\n2) Klikk "Lagre søk".\n3) Under "Mine sider → Lagrede søk", kopier RSS-lenken.\n4) Lim inn på Kilder-siden i denne appen.`;
    case "linkedin":
      return `LinkedIn krever innlogging og blokkerer scraping. Anbefalt: opprett et "Job alert" på LinkedIn, eller lim inn enkeltjobber via "Ny jobb → URL".`;
    case "arbeidsplassen":
      return `Arbeidsplassen (NAV) svarte ikke. Prøv igjen senere, eller bruk det offentlige API-et på arbeidsplassen.nav.no/stillinger og lim inn URL-er manuelt.`;
  }
}

async function searchArbeidsplassen(query: string, location: string | null): Promise<SearchResult> {
  try {
    const hits = await searchArbeidsplassenJobs(query, location, 25);
    return {
      ok: true,
      hits: hits.slice(0, 20).map((hit) => ({
        external_id: hit.external_id,
        url: hit.source_url,
        title: hit.title,
        company: hit.company,
        location: hit.location,
        description: hit.description,
      })),
    };
  } catch (e) {
    return { ok: false, status: "error", error: (e as Error).message };
  }
}

// Finn now uses /job/ad/<numeric-id>. Search redirects from /job/fulltime/search.html -> /job/search
async function searchFinnHtml(query: string, location: string | null): Promise<SearchResult> {
  try {
    const params = new URLSearchParams({ q: query.trim() });
    if (location) params.set("location", location.trim());
    const url = `https://www.finn.no/job/search?${params}`;
    const resp = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "nb-NO,nb;q=0.9,en;q=0.8",
      },
    });
    if (resp.status === 403 || resp.status === 429 || resp.status === 503) {
      return { ok: false, status: "blocked", error: `HTTP ${resp.status}`, hint: blockedHint("finn", query, location) };
    }
    if (!resp.ok) return { ok: false, status: "error", error: `HTTP ${resp.status}` };
    const html = await resp.text();

    // Extract each <article>...</article> block and pull id + title + company
    const articleRe = /<article\b[^>]*>([\s\S]*?)<\/article>/gi;
    const hits: Hit[] = [];
    const seen = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = articleRe.exec(html)) !== null && hits.length < 20) {
      const block = m[1];
      const linkMatch = block.match(/href="(https:\/\/www\.finn\.no\/job\/ad\/(\d+))"/);
      if (!linkMatch) continue;
      const href = linkMatch[1];
      const id = linkMatch[2];
      if (seen.has(id)) continue;
      seen.add(id);

      // Title is inside the anchor (usually a <span> + visible text)
      const anchorMatch = block.match(/<a[^>]+class="[^"]*job-card-link[^"]*"[^>]*>([\s\S]*?)<\/a>/);
      let title = "";
      if (anchorMatch) {
        title = anchorMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      }
      if (!title) {
        // Fallback: any text after the anchor opening
        const fb = block.match(/job-card-link[^>]*>(?:<[^>]+>)*([^<]{3,200})/);
        title = fb?.[1]?.trim() ?? "Uten tittel";
      }

      // Company is in a <strong> inside text-caption div
      const companyMatch = block.match(/<strong>([^<]{1,150})<\/strong>/);
      const company = companyMatch?.[1]?.trim() ?? null;

      hits.push({
        external_id: `finn-${id}`,
        url: href,
        title: title.slice(0, 240),
        company,
        location: null,
        description: null,
      });
    }

    if (hits.length === 0) {
      return { ok: false, status: "blocked", error: "Ingen treff i HTML – sannsynligvis blokkert eller endret format", hint: blockedHint("finn", query, location) };
    }
    return { ok: true, hits };
  } catch (e) {
    return { ok: false, status: "error", error: (e as Error).message };
  }
}

async function searchLinkedIn(query: string, location: string | null): Promise<SearchResult> {
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
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let scopedUserId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader && !authHeader.includes(Deno.env.get("SUPABASE_ANON_KEY") ?? "___")) {
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: u } = await userClient.auth.getUser();
      if (u.user) scopedUserId = u.user.id;
    }

    const body = await req.json().catch(() => ({}));
    const { searchId } = body as { searchId?: string };

    let q = admin.from("auto_searches").select("*").eq("is_active", true);
    if (scopedUserId) q = q.eq("user_id", scopedUserId);
    if (searchId) q = q.eq("id", searchId);
    const { data: searches, error } = await q;
    if (error) return json({ error: error.message }, 500);

    let totalNew = 0;
    let totalSkipped = 0;
    let stoppedNoCredits = false;
    const results: any[] = [];

    for (const s of searches ?? []) {
      if (stoppedNoCredits) break;

      const result = await runSearch(s.source as Source, s.query, s.location);
      const updates: Record<string, unknown> = {
        last_checked_at: new Date().toISOString(),
      };

      if (!result.ok) {
        updates.last_status = result.status;
        updates.last_error = result.error;
        updates.blocked_hint = result.hint ?? null;
        await admin.from("auto_searches").update(updates).eq("id", s.id);
        results.push({ id: s.id, name: s.name, status: result.status, error: result.error });
        continue;
      }

      // Load profile once per search to score consistently
      const { data: profile } = await admin
        .from("profiles")
        .select("*")
        .eq("user_id", s.user_id)
        .maybeSingle();
      const highMatchThreshold = (profile as any)?.notify_high_match_min_score ?? 90;

      let newCount = 0;
      let skippedCount = 0;

      for (const hit of result.hits) {
        if (stoppedNoCredits) break;

        const { data: existing } = await admin
          .from("jobs")
          .select("id")
          .eq("user_id", s.user_id)
          .eq("source_url", hit.url)
          .maybeSingle();
        if (existing) continue;

        // Fetch the actual job page and let the AI extract description, deadline, scores etc.
        const baseText = `${hit.title}\n${hit.company ?? ""}\n${hit.location ?? ""}\n${hit.description ?? ""}`;
        const fullText = await fetchJobText(hit.url, baseText);
        const aiResult = await aiParse(fullText, hit.url, profile);

        // Throttle between AI calls to avoid rate-limit spikes
        await new Promise((r) => setTimeout(r, 300));

        if (!aiResult.ok) {
          if (aiResult.reason === "no_credits") {
            stoppedNoCredits = true;
            updates.last_status = "error";
            updates.last_error = "AI-kreditt tom – fyll på i Lovable-arbeidsområdet.";
            console.error("Stopping auto-search: no credits");
            break;
          }
          // Rate-limited or transient error: don't insert empty job — try again next cron
          skippedCount++;
          continue;
        }

        const parsed = aiResult.parsed;
        const totalScore = weightedScore(parsed, profile);

        const insertRow: Record<string, unknown> = {
          user_id: s.user_id,
          title: parsed.title || hit.title,
          company: parsed.company || hit.company || null,
          location: parsed.location || hit.location || null,
          source: s.source === "linkedin" ? ("linkedin" as const) : ("auto_search" as const),
          source_url: hit.url,
          description: parsed.description ?? hit.description ?? null,
          status: "discovered" as const,
          ai_summary: parsed.ai_summary,
          notes: `Fra auto-søk: ${s.name} (${s.source})`,
          deadline: parsed.deadline && /^\d{4}-\d{2}-\d{2}$/.test(parsed.deadline) ? parsed.deadline : null,
          match_score: totalScore,
          score_professional: parsed.score_professional,
          score_culture: parsed.score_culture,
          score_practical: parsed.score_practical,
          score_enthusiasm: parsed.score_enthusiasm,
          risk_flags: parsed.risk_flags ?? [],
        };

        const { data: insertedJob, error: insErr } = await admin
          .from("jobs")
          .insert(insertRow)
          .select("id, title, company, location")
          .maybeSingle();
        if (insErr) continue;
        newCount++;

        if (insertedJob && totalScore >= highMatchThreshold) {
          await admin.from("notifications").insert({
            user_id: s.user_id,
            kind: "high_match_job",
            title: `Ny match ${totalScore}/100: ${insertedJob.title}`,
            body: insertedJob.company
              ? `${insertedJob.company}${insertedJob.location ? ` · ${insertedJob.location}` : ""}`
              : (insertedJob.location ?? null),
            job_id: insertedJob.id,
            metadata: { score: totalScore, source: s.source, search_name: s.name },
          });
        }
      }

      totalNew += newCount;
      totalSkipped += skippedCount;
      if (!stoppedNoCredits) {
        updates.last_status = "ok";
        updates.last_error = skippedCount > 0 ? `${skippedCount} jobber hoppet over (rate-limit) – prøves igjen neste runde.` : null;
        updates.blocked_hint = null;
        updates.items_found = (s.items_found ?? 0) + newCount;
      }
      await admin.from("auto_searches").update(updates).eq("id", s.id);
      results.push({ id: s.id, name: s.name, status: "ok", hits: result.hits.length, new: newCount, skipped: skippedCount });
    }

    return json({ searches: searches?.length ?? 0, newJobs: totalNew, skipped: totalSkipped, stoppedNoCredits, results });
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
