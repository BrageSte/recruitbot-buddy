import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  corsHeaders,
  ExternalJobRow,
  json,
  rankCandidate,
  tokenize,
} from "../_shared/full-match.ts";

const CANDIDATE_POOL = 300;
const MAX_LIMIT = 6;
const DEFAULT_LIMIT = 3;
const MIN_KEYWORDS_LEN = 3;
const MAX_KEYWORDS_LEN = 240;
const MAX_LOCATION_LEN = 120;
const MAX_DEALBREAKERS_LEN = 240;

type AnonMatchOut = {
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  provider: string;
  source_url: string | null;
  score: number;
  deadline: string | null;
  matched_terms: string[];
};

function clampLimit(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.round(n)));
}

function pickLocationToken(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  const tokens = trimmed
    .split(/[,\s/]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !["fra", "med", "uten", "remote", "hybrid"].includes(t));
  return tokens[0] ?? null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: { keywords?: string; location?: string; limit?: number; dealbreakers?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "Ugyldig JSON" }, 400);
  }

  const keywordsRaw = String(body.keywords ?? "").trim();
  if (keywordsRaw.length < MIN_KEYWORDS_LEN || keywordsRaw.length > MAX_KEYWORDS_LEN) {
    return json({ matches: [], reason: "keywords_invalid" });
  }
  const locationRaw = String(body.location ?? "").trim().slice(0, MAX_LOCATION_LEN);
  const dealbreakersRaw = String(body.dealbreakers ?? "").trim().slice(0, MAX_DEALBREAKERS_LEN);
  const limit = clampLimit(body.limit);

  const terms = Array.from(new Set(tokenize(keywordsRaw)));
  if (terms.length === 0) {
    return json({ matches: [], reason: "no_terms" });
  }
  const negativeTerms = Array.from(new Set(tokenize(dealbreakersRaw)));

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return json({ error: "Server misconfigured" }, 500);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const locationToken = pickLocationToken(locationRaw);
  let query = admin
    .from("external_jobs")
    .select("id, provider, external_id, source_url, title, company, location, description, deadline, status, raw_data, fetched_at, provider_updated_at, last_seen_at")
    .eq("status", "active")
    .order("last_seen_at", { ascending: false })
    .limit(CANDIDATE_POOL);

  if (locationToken) {
    query = query.ilike("location", `%${locationToken}%`);
  }

  const { data, error } = await query;
  if (error) {
    console.error("match-anonymous query failed", error);
    return json({ error: "Kunne ikke hente jobber" }, 500);
  }

  const candidates = (data ?? []) as ExternalJobRow[];

  // If location filter returned almost nothing, fall back to no-location filter.
  let pool = candidates;
  if (locationToken && candidates.length < limit * 2) {
    const fallback = await admin
      .from("external_jobs")
      .select("id, provider, external_id, source_url, title, company, location, description, deadline, status, raw_data, fetched_at, provider_updated_at, last_seen_at")
      .eq("status", "active")
      .order("last_seen_at", { ascending: false })
      .limit(CANDIDATE_POOL);
    if (!fallback.error) {
      pool = (fallback.data ?? []) as ExternalJobRow[];
    }
  }

  const ranked = pool
    .map((job) => ({ job, score: rankCandidate(job, terms, negativeTerms) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const matches: AnonMatchOut[] = ranked.map(({ job, score }) => {
    const hay = `${job.title ?? ""} ${job.company ?? ""} ${job.location ?? ""} ${job.description ?? ""}`.toLowerCase();
    const matched_terms = terms.filter((t) => hay.includes(t.toLowerCase())).slice(0, 6);
    return {
      id: job.id,
      title: job.title,
      company: job.company,
      location: job.location,
      provider: job.provider,
      source_url: job.source_url,
      score: Math.round(score),
      deadline: job.deadline ?? null,
      matched_terms,
    };
  });

  return json({ matches });
});
