// Polls all active RSS feeds across all users, parses items,
// and creates new "discovered" jobs scored by AI for each user.
// Triggered by pg_cron every 30 minutes (or manually for one user).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYS = `Du leser stillingsannonser og returnerer strukturert JSON. Skriv på norsk. Vær ærlig i risk_flags.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let body: any = {};
  try { body = await req.json(); } catch { /* cron sends empty */ }

  const userIdFilter: string | null = body?.userId ?? null;
  const feedIdFilter: string | null = body?.feedId ?? null;

  // Fetch active feeds (optionally filtered)
  let q = admin.from("rss_feeds").select("*").eq("is_active", true);
  if (userIdFilter) q = q.eq("user_id", userIdFilter);
  if (feedIdFilter) q = q.eq("id", feedIdFilter);
  const { data: feeds, error: feedErr } = await q;
  if (feedErr) return json({ error: feedErr.message }, 500);
  if (!feeds || feeds.length === 0) return json({ ok: true, feeds: 0, items: 0 });

  let totalNewItems = 0;
  const results: any[] = [];

  for (const feed of feeds) {
    try {
      const isFinnHtml = /finn\.no\/job\/(search|fulltime\/search)/i.test(feed.url);
      const ua = isFinnHtml
        ? "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        : "JobHunterAI/1.0";
      const resp = await fetch(feed.url, {
        redirect: "follow",
        headers: {
          "User-Agent": ua,
          Accept: isFinnHtml ? "text/html,application/xhtml+xml" : "application/rss+xml,application/xml,text/xml,*/*",
          "Accept-Language": "nb-NO,nb;q=0.9,en;q=0.8",
        },
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const body = await resp.text();
      const items = isFinnHtml ? parseFinnSearchHtml(body) : parseRss(body);

      // Get already-seen GUIDs
      const guids = items.map((i) => i.guid).filter(Boolean);
      const { data: seen } = await admin.from("rss_seen_items")
        .select("guid").eq("feed_id", feed.id).in("guid", guids);
      const seenSet = new Set((seen ?? []).map((s) => s.guid));

      const newItems = items.filter((i) => i.guid && !seenSet.has(i.guid));

      // Cap to avoid runaway processing on first poll
      const toProcess = newItems.slice(0, 10);

      // Load profile + auto-apply settings once
      const [{ data: profile }, { data: autoSettings }] = await Promise.all([
        admin.from("profiles").select("*").eq("user_id", feed.user_id).maybeSingle(),
        admin.from("auto_apply_settings").select("*").eq("user_id", feed.user_id).maybeSingle(),
      ]);

      for (const item of toProcess) {
        try {
          // Mark as seen first to avoid duplicates on retry
          await admin.from("rss_seen_items").insert({
            feed_id: feed.id, guid: item.guid, link: item.link,
          });

          // Build text from RSS item (title + description + maybe fetch full page)
          let raw = `${item.title}\n\n${stripHtml(item.description ?? "")}`;
          if (item.link && raw.length < 800) {
            try {
              const r = await fetch(item.link, { headers: { "User-Agent": "JobHunterAI/1.0" } });
              const html = await r.text();
              raw = stripHtml(html).slice(0, 12000);
            } catch { /* keep RSS-only text */ }
          }

          const parsed = await aiParse(raw, item.link, profile);
          if (!parsed) continue;

          const w = profile ?? { weight_professional: 40, weight_culture: 20, weight_practical: 20, weight_enthusiasm: 20 };
          const total = Math.round(
            (parsed.score_professional * w.weight_professional +
              parsed.score_culture * w.weight_culture +
              parsed.score_practical * w.weight_practical +
              parsed.score_enthusiasm * w.weight_enthusiasm) / 100
          );

          const { data: job } = await admin.from("jobs").insert({
            user_id: feed.user_id,
            title: parsed.title,
            company: parsed.company || null,
            location: parsed.location || null,
            source: "rss" as const,
            source_url: item.link,
            description: parsed.description,
            deadline: parsed.deadline && /^\d{4}-\d{2}-\d{2}$/.test(parsed.deadline) ? parsed.deadline : null,
            ai_summary: parsed.ai_summary,
            match_score: total,
            score_professional: parsed.score_professional,
            score_culture: parsed.score_culture,
            score_practical: parsed.score_practical,
            score_enthusiasm: parsed.score_enthusiasm,
            risk_flags: parsed.risk_flags ?? [],
            status: "discovered" as const,
          }).select().maybeSingle();

          totalNewItems++;

          // Auto-draft if score qualifies
          if (job && autoSettings?.is_enabled && total >= autoSettings.min_score) {
            const skipForRisks = autoSettings.exclude_with_risks && (parsed.risk_flags?.length ?? 0) > 0;
            if (!skipForRisks) {
              // Check daily limit
              const since = new Date(); since.setHours(0,0,0,0);
              const { count } = await admin.from("jobs").select("*", { count: "exact", head: true })
                .eq("user_id", feed.user_id).gte("auto_draft_at", since.toISOString());
              if ((count ?? 0) < autoSettings.daily_limit) {
                await triggerAutoDraft(admin, feed.user_id, job.id);
              }
            }
          }
        } catch (e) {
          console.error("item processing failed", item.link, e);
        }
      }

      await admin.from("rss_feeds").update({
        last_checked_at: new Date().toISOString(),
        last_item_guid: items[0]?.guid ?? feed.last_item_guid,
        items_found: feed.items_found + toProcess.length,
        last_error: null,
      }).eq("id", feed.id);

      results.push({ feed: feed.name, found: toProcess.length });
    } catch (e) {
      console.error("feed failed", feed.name, e);
      await admin.from("rss_feeds").update({
        last_checked_at: new Date().toISOString(),
        last_error: (e as Error).message.slice(0, 500),
      }).eq("id", feed.id);
      results.push({ feed: feed.name, error: (e as Error).message });
    }
  }

  return json({ ok: true, feeds: feeds.length, newItems: totalNewItems, results });
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

type RssItem = { title: string; link: string; guid: string; description?: string; pubDate?: string };

function parseRss(xml: string): RssItem[] {
  const items: RssItem[] = [];
  // Handle both RSS <item> and Atom <entry>
  const re = /<(item|entry)[\s\S]*?<\/(item|entry)>/gi;
  const matches = xml.match(re) ?? [];
  for (const m of matches) {
    const title = pick(m, "title") ?? "";
    let link = pickAttr(m, "link", "href") ?? pick(m, "link") ?? "";
    if (!link) {
      const linkMatch = m.match(/<link[^>]*>([^<]+)<\/link>/i);
      if (linkMatch) link = linkMatch[1].trim();
    }
    const guid = pick(m, "guid") ?? pick(m, "id") ?? link;
    const description = pick(m, "description") ?? pick(m, "summary") ?? pick(m, "content") ?? "";
    const pubDate = pick(m, "pubDate") ?? pick(m, "published") ?? pick(m, "updated") ?? undefined;
    if (title) items.push({ title: stripHtml(title), link: link.trim(), guid: guid.trim(), description, pubDate });
  }
  return items;
}

// Parse Finn.no job search HTML (when user pastes a finn.no/job/search URL as a "feed").
// Finn now uses /job/ad/<numeric-id> for individual ads.
function parseFinnSearchHtml(html: string): RssItem[] {
  const items: RssItem[] = [];
  const seen = new Set<string>();
  const articleRe = /<article\b[^>]*>([\s\S]*?)<\/article>/gi;
  let m: RegExpExecArray | null;
  while ((m = articleRe.exec(html)) !== null) {
    const block = m[1];
    const linkMatch = block.match(/href="(https:\/\/www\.finn\.no\/job\/ad\/(\d+))"/);
    if (!linkMatch) continue;
    const link = linkMatch[1];
    const id = linkMatch[2];
    if (seen.has(id)) continue;
    seen.add(id);

    const anchorMatch = block.match(/<a[^>]+class="[^"]*job-card-link[^"]*"[^>]*>([\s\S]*?)<\/a>/);
    let title = anchorMatch
      ? anchorMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
      : "";
    if (!title) title = "Stilling";

    const companyMatch = block.match(/<strong>([^<]{1,150})<\/strong>/);
    const company = companyMatch?.[1]?.trim();
    const description = company ? `<p><strong>${company}</strong></p>` : "";

    items.push({
      title: title.slice(0, 240),
      link,
      guid: `finn-${id}`,
      description,
    });
  }
  return items;
}

function pick(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = xml.match(re);
  if (!m) return null;
  let v = m[1].trim();
  // CDATA
  v = v.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");
  return v;
}

function pickAttr(xml: string, tag: string, attr: string): string | null {
  const re = new RegExp(`<${tag}[^>]*${attr}=["']([^"']+)["']`, "i");
  const m = xml.match(re);
  return m ? m[1] : null;
}

async function aiParse(raw: string, link: string | null, profile: any) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return null;

  const tool = {
    type: "function",
    function: {
      name: "extract_job",
      description: "Returnerer strukturert info om en jobbstilling.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          company: { type: "string" },
          location: { type: "string" },
          deadline: { type: "string", description: "ISO-dato YYYY-MM-DD eller tom streng" },
          description: { type: "string", description: "Hele stillingsteksten i ren markdown" },
          ai_summary: { type: "string", description: "1-2 setninger på norsk" },
          score_professional: { type: "integer", minimum: 0, maximum: 100 },
          score_culture: { type: "integer", minimum: 0, maximum: 100 },
          score_practical: { type: "integer", minimum: 0, maximum: 100 },
          score_enthusiasm: { type: "integer", minimum: 0, maximum: 100 },
          risk_flags: { type: "array", items: { type: "string" } },
        },
        required: ["title", "description", "ai_summary", "score_professional", "score_culture", "score_practical", "score_enthusiasm", "risk_flags"],
      },
    },
  };

  const profileContext = profile ? `\n\nBRUKERPROFIL:\n${profile.master_profile ?? ""}\n\nVEKTER (%): Fag ${profile.weight_professional}, Kultur ${profile.weight_culture}, Praktisk ${profile.weight_practical}, Entusiasme ${profile.weight_enthusiasm}\n\nGRØNN: ${profile.rules_green}\nGUL: ${profile.rules_yellow}\nRØD: ${profile.rules_red}` : "";

  const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: SYS + profileContext },
        { role: "user", content: `Parse og score denne stillingen.\nKILDE: ${link ?? ""}\n\n${raw.slice(0, 12000)}` },
      ],
      tools: [tool],
      tool_choice: { type: "function", function: { name: "extract_job" } },
    }),
  });

  if (!aiResp.ok) {
    console.error("AI parse failed", aiResp.status);
    return null;
  }
  const aiData = await aiResp.json();
  const call = aiData.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) return null;
  try { return JSON.parse(call.function.arguments); } catch { return null; }
}

async function triggerAutoDraft(admin: any, userId: string, jobId: string) {
  // Mark first to prevent duplicates
  await admin.from("jobs").update({ auto_draft_at: new Date().toISOString() }).eq("id", jobId);

  // Call generate-application internally with a service-role-impersonated request.
  // Since generate-application requires JWT, we use admin to do it directly here.
  try {
    const [{ data: job }, { data: profile }, { data: cv }] = await Promise.all([
      admin.from("jobs").select("*").eq("id", jobId).maybeSingle(),
      admin.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
      admin.from("cv_templates").select("*").eq("user_id", userId).eq("is_active", true).maybeSingle(),
    ]);
    if (!job) return;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
    const userContext = `MASTER-PROFIL:\n${profile?.master_profile ?? ""}\n\nSTIL-GUIDE:\n${profile?.style_guide ?? ""}\n\nCV-MAL:\n${JSON.stringify(cv ?? {}, null, 2)}\n\nSTILLING:\nTittel: ${job.title}\nSelskap: ${job.company ?? ""}\nLokasjon: ${job.location ?? ""}\nBeskrivelse:\n${job.description ?? ""}`;

    const tool = {
      type: "function",
      function: {
        name: "write_application",
        parameters: {
          type: "object",
          properties: {
            application_text: { type: "string" },
            cv_notes: { type: "string" },
          },
          required: ["application_text", "cv_notes"],
        },
      },
    };

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "Skriv ærlig søknad på norsk. Bruk master-profil + stil-guide + CV-mal. Markdown." },
          { role: "user", content: userContext },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "write_application" } },
      }),
    });

    if (!aiResp.ok) return;
    const aiData = await aiResp.json();
    const call = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) return;
    const parsed = JSON.parse(call.function.arguments);

    await admin.from("applications").insert({
      user_id: userId, job_id: jobId,
      generated_text: parsed.application_text, cv_notes: parsed.cv_notes,
      status: "draft" as const,
    });
    await admin.from("jobs").update({ status: "considering" as any }).eq("id", jobId);
  } catch (e) {
    console.error("auto-draft failed", e);
  }
}
