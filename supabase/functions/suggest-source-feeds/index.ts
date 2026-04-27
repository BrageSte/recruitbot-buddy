import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildProfileTerms, buildSignalText, corsHeaders, json, tokenize } from "../_shared/full-match.ts";

type Suggestion = {
  name: string;
  query: string;
  location?: string | null;
  reason: string;
  confidence: number;
};

function finnSearchUrl(query: string, location?: string | null) {
  const params = new URLSearchParams();
  params.set("q", query.trim());
  if (location?.trim()) params.set("location", location.trim());
  return `https://www.finn.no/job/search?${params.toString()}`;
}

function normalizeSuggestion(s: Suggestion): Suggestion {
  const query = s.query.trim().replace(/\s+/g, " ").slice(0, 120);
  const location = s.location?.trim() ? s.location.trim().slice(0, 80) : null;
  return {
    name: (s.name?.trim() || `Finn - ${query}`).slice(0, 120),
    query,
    location,
    reason: (s.reason?.trim() || "Foreslått fra profil og interesser.").slice(0, 500),
    confidence: Math.max(0, Math.min(100, Math.round(Number(s.confidence) || 60))),
  };
}

function uniqSuggestions(items: Suggestion[]) {
  const seen = new Set<string>();
  const out: Suggestion[] = [];
  for (const raw of items) {
    const item = normalizeSuggestion(raw);
    if (!item.query || item.query.length < 3) continue;
    const key = `${item.query.toLowerCase()}|${item.location?.toLowerCase() ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out.slice(0, 12);
}

function fallbackSuggestions(profile: any, cv: any, signals: any[], feedback: any[], matches: any[]): Suggestion[] {
  const locationSignals = signals
    .filter((s) => s.category === "location" && (s.weight ?? 0) >= 0)
    .map((s) => s.label);
  const defaultLocation = locationSignals[0] ?? cv?.location ?? null;
  const positiveSignals = signals
    .filter((s) => (s.weight ?? 0) >= 0 && s.category !== "dealbreaker" && s.category !== "location")
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
    .map((s) => s.label);

  const likedTitles = matches
    .filter((m) => (m.match_score ?? 0) >= 75)
    .map((m) => m.external_jobs?.title ?? "")
    .flatMap((title) => tokenize(title))
    .filter((term) => term.length > 4);

  const profileTerms = tokenize([
    profile?.master_profile ?? "",
    cv?.headline ?? "",
    JSON.stringify(cv?.skills ?? []),
    positiveSignals.join(" "),
    likedTitles.join(" "),
  ].join(" "));

  const terms = Array.from(new Set([...positiveSignals, ...profileTerms]))
    .filter((term) => term.length >= 4)
    .slice(0, 8);

  const pairs: Suggestion[] = [];
  for (const term of terms.slice(0, 6)) {
    pairs.push({
      name: `Finn - ${term}${defaultLocation ? ` ${defaultLocation}` : ""}`,
      query: term,
      location: defaultLocation,
      reason: "Laget automatisk fra interesseprofil, CV og tidligere matcher.",
      confidence: 58,
    });
  }

  if (terms.length >= 2) {
    pairs.unshift({
      name: `Finn - ${terms[0]} + ${terms[1]}`,
      query: `${terms[0]} ${terms[1]}`,
      location: defaultLocation,
      reason: "Kombinerer de sterkeste signalene for å gi et smalere Finn-søk.",
      confidence: 72,
    });
  }

  return pairs;
}

async function aiSuggestions(profile: any, cv: any, signals: any[], feedback: any[], matches: any[]): Promise<Suggestion[] | null> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return null;

  const { positiveTerms, negativeTerms } = buildProfileTerms(profile, cv, signals, feedback);
  const tool = {
    type: "function",
    function: {
      name: "suggest_finn_searches",
      parameters: {
        type: "object",
        properties: {
          suggestions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                query: { type: "string" },
                location: { type: "string" },
                reason: { type: "string" },
                confidence: { type: "integer", minimum: 0, maximum: 100 },
              },
              required: ["name", "query", "reason", "confidence"],
            },
          },
        },
        required: ["suggestions"],
      },
    },
  };

  const matchLines = matches
    .slice(0, 12)
    .map((m) => `- ${m.match_score ?? "?"}: ${m.external_jobs?.title ?? ""} ${m.external_jobs?.company ?? ""}`)
    .join("\n");

  const prompt = `Lag 6-10 FINN Jobb-søk som brukeren burde følge. Dette skal være søk, ikke scraping. Hold query kort og robust.

MASTERPROFIL:
${profile?.master_profile ?? "(tom)"}

CV:
${cv ? JSON.stringify({ headline: cv.headline, intro: cv.intro, skills: cv.skills, location: cv.location }).slice(0, 3500) : "(ingen CV)"}

INTERESSESIGNALER:
${buildSignalText(signals)}

POSITIVE TERMER:
${positiveTerms.slice(0, 30).join(", ")}

NEGATIVE/DEALBREAKER TERMER:
${negativeTerms.slice(0, 20).join(", ")}

STERKE MATCHER:
${matchLines || "(ingen ennå)"}

Returner søk med søkeord og valgfritt sted. Ikke lag for brede søk som "jobb" eller "Oslo". Ikke inkluder negative/dealbreaker-termer.`;

  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "Du lager konkrete, lovlige kildesøk for FINN Jobb basert på kandidatprofil." },
          { role: "user", content: prompt },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "suggest_finn_searches" } },
      }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const call = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) return null;
    const parsed = JSON.parse(call.function.arguments);
    return Array.isArray(parsed.suggestions) ? parsed.suggestions : null;
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Mangler auth" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await userClient.auth.getUser();
    const user = userData.user;
    if (!user) return json({ error: "Ikke autentisert" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const force = Boolean(body.force);

    const [{ data: profile }, { data: existing }] = await Promise.all([
      admin.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
      admin
        .from("source_suggestions")
        .select("id,status")
        .eq("user_id", user.id)
        .neq("status", "dismissed"),
    ]);

    if (profile?.auto_source_suggestions_enabled === false && !force) {
      return json({ ok: true, skipped: true, reason: "auto_source_suggestions_disabled", generated: 0 });
    }

    if (!force && (existing?.length ?? 0) > 0) {
      return json({ ok: true, skipped: true, reason: "suggestions_exist", generated: 0 });
    }

    const [{ data: cv }, { data: signals }, { data: feedback }, { data: matches }] = await Promise.all([
      admin.from("cv_templates").select("*").eq("user_id", user.id).order("is_default", { ascending: false }).order("created_at", { ascending: true }).limit(1).maybeSingle(),
      admin.from("profile_interest_signals").select("*").eq("user_id", user.id),
      admin.from("job_score_feedback").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(80),
      admin
        .from("user_job_matches")
        .select("match_score, external_jobs(title, company, location)")
        .eq("user_id", user.id)
        .order("match_score", { ascending: false, nullsFirst: false })
        .limit(30),
    ]);

    const ai = await aiSuggestions(profile, cv, signals ?? [], feedback ?? [], matches ?? []);
    const suggestions = uniqSuggestions(ai?.length ? ai : fallbackSuggestions(profile, cv, signals ?? [], feedback ?? [], matches ?? []));

    let upserted = 0;
    for (const suggestion of suggestions) {
      const row = {
        user_id: user.id,
        provider: "finn",
        name: suggestion.name,
        query: suggestion.query,
        location: suggestion.location ?? null,
        search_url: finnSearchUrl(suggestion.query, suggestion.location),
        reason: suggestion.reason,
        confidence: suggestion.confidence,
        status: "suggested",
        is_active: true,
        metadata: { generated_by: ai?.length ? "ai" : "fallback" },
        last_generated_at: new Date().toISOString(),
      };
      const { error } = await admin.from("source_suggestions").upsert(row, { onConflict: "user_id,provider,query,location" });
      if (!error) upserted++;
      else console.error("source suggestion upsert failed", error.message);
    }

    return json({ ok: true, generated: upserted, suggestions });
  } catch (e) {
    console.error("suggest-source-feeds error", e);
    return json({ error: (e as Error).message }, 500);
  }
});
