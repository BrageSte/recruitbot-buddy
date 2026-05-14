import { normalizeDeadline, stripHtml } from "./full-match.ts";

const NAV_SEARCH_URL = "https://arbeidsplassen.nav.no/stillinger/api/search";
const UA = "SoklyFullMatch/1.0";

export type NavSearchHit = {
  external_id: string;
  source_url: string;
  title: string;
  company: string | null;
  location: string | null;
  description: string | null;
  deadline: string | null;
  raw_data: Record<string, unknown>;
  nav_score: number;
};

function locationFromSearchSource(src: any) {
  const locArr = Array.isArray(src.locationList) ? src.locationList : [];
  const first = locArr[0] ?? {};
  return [first.city, first.municipal, first.county].filter(Boolean).join(", ") || null;
}

function descriptionFromSearchSource(src: any) {
  const properties = src.properties ?? {};
  const tags = [
    ...(Array.isArray(properties.searchtagsai) ? properties.searchtagsai : []),
    ...(Array.isArray(properties.searchtags) ? properties.searchtags.map((tag: any) => tag?.label ?? tag?.name) : []),
  ].filter(Boolean);
  return [
    src.generatedSearchMetadata?.shortSummary,
    tags.length ? `Søketagger: ${tags.join(", ")}` : "",
    properties.keywords ? `Nøkkelord: ${properties.keywords}` : "",
  ].filter(Boolean).map(stripHtml).join("\n\n") || null;
}

export async function searchArbeidsplassenJobs(
  query: string,
  location: string | null = null,
  size = 20,
): Promise<NavSearchHit[]> {
  const q = [query.trim(), location?.trim()].filter(Boolean).join(" ").replace(/\s+/g, " ");
  if (q.length < 3) return [];

  const limit = Math.max(1, Math.min(50, Math.round(size)));
  const params = new URLSearchParams({ q, size: String(limit) });
  const resp = await fetch(`${NAV_SEARCH_URL}?${params}`, {
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  if (!resp.ok) throw new Error(`Arbeidsplassen-søk svarte HTTP ${resp.status}`);

  const data = await resp.json();
  const hitsRaw = (data?.hits?.hits ?? []) as any[];
  return hitsRaw.flatMap((hit) => {
    const src = hit._source ?? {};
    const uuid = src.uuid ?? hit._id;
    const title = src.title ?? src.properties?.jobtitle;
    if (!uuid || !title) return [];
    return [{
      external_id: String(uuid),
      source_url: `https://arbeidsplassen.nav.no/stillinger/stilling/${uuid}`,
      title: String(title).trim(),
      company: src.employer?.name ?? src.businessName ?? null,
      location: locationFromSearchSource(src),
      description: descriptionFromSearchSource(src),
      deadline: normalizeDeadline(src.properties?.applicationdue ?? src.expires),
      raw_data: src,
      nav_score: Number(hit._score ?? 0),
    }];
  }).slice(0, limit);
}
