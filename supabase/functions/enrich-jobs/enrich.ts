// Shared enrichment: fetch the job page and ask the AI to extract structured fields.
// Used by both auto-search and enrich-jobs.

const SYS = `Du leser stillingsannonser og returnerer strukturert JSON. Skriv på norsk. Vær ærlig i risk_flags.`;

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export type ParsedJob = {
  title: string;
  company?: string;
  location?: string;
  deadline?: string;
  description: string;
  ai_summary: string;
  score_professional: number;
  score_culture: number;
  score_practical: number;
  score_enthusiasm: number;
  risk_flags: string[];
};

export type AiParseResult =
  | { ok: true; parsed: ParsedJob }
  | { ok: false; reason: "rate_limited" | "no_credits" | "error"; status?: number; message?: string };

export function stripHtml(html: string): string {
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

export async function fetchJobText(url: string, fallback: string): Promise<string> {
  try {
    const r = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "nb-NO,nb;q=0.9,en;q=0.8",
      },
    });
    if (!r.ok) return fallback;
    const html = await r.text();
    const text = stripHtml(html);
    return text.length > 200 ? text.slice(0, 12000) : fallback;
  } catch {
    return fallback;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function aiParse(raw: string, link: string | null, profile: any): Promise<AiParseResult> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return { ok: false, reason: "error", message: "LOVABLE_API_KEY not configured" };

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

  const profileContext = profile
    ? `\n\nBRUKERPROFIL:\n${profile.master_profile ?? ""}\n\nVEKTER (%): Fag ${profile.weight_professional}, Kultur ${profile.weight_culture}, Praktisk ${profile.weight_practical}, Entusiasme ${profile.weight_enthusiasm}\n\nGRØNN: ${profile.rules_green}\nGUL: ${profile.rules_yellow}\nRØD: ${profile.rules_red}`
    : "";

  const body = JSON.stringify({
    model: "google/gemini-3-flash-preview",
    messages: [
      { role: "system", content: SYS + profileContext },
      { role: "user", content: `Parse og score denne stillingen.\nKILDE: ${link ?? ""}\n\n${raw.slice(0, 12000)}` },
    ],
    tools: [tool],
    tool_choice: { type: "function", function: { name: "extract_job" } },
  });

  // Retry on 429 (rate limit) and 5xx (transient): 3 attempts, exponential backoff
  const delays = [2000, 5000, 12000];
  let lastStatus = 0;
  let lastBody = "";

  for (let attempt = 0; attempt < delays.length + 1; attempt++) {
    try {
      const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body,
      });

      if (aiResp.ok) {
        const aiData = await aiResp.json();
        const call = aiData.choices?.[0]?.message?.tool_calls?.[0];
        if (!call) {
          console.error("AI parse: no tool_call in response", JSON.stringify(aiData).slice(0, 300));
          return { ok: false, reason: "error", message: "no tool_call in response" };
        }
        try {
          return { ok: true, parsed: JSON.parse(call.function.arguments) as ParsedJob };
        } catch (e) {
          console.error("AI parse: JSON.parse failed", (e as Error).message);
          return { ok: false, reason: "error", message: "invalid JSON in tool_call" };
        }
      }

      lastStatus = aiResp.status;
      lastBody = (await aiResp.text()).slice(0, 200);

      if (aiResp.status === 402) {
        console.error("AI parse: 402 no credits", lastBody);
        return { ok: false, reason: "no_credits", status: 402, message: lastBody };
      }
      if (aiResp.status === 429 || aiResp.status >= 500) {
        if (attempt < delays.length) {
          console.warn(`AI parse: ${aiResp.status}, retry ${attempt + 1}/${delays.length} in ${delays[attempt]}ms`);
          await sleep(delays[attempt]);
          continue;
        }
        console.error("AI parse: ${aiResp.status} after retries", lastBody);
        return { ok: false, reason: aiResp.status === 429 ? "rate_limited" : "error", status: aiResp.status, message: lastBody };
      }

      // Other 4xx — don't retry
      console.error("AI parse failed", aiResp.status, lastBody);
      return { ok: false, reason: "error", status: aiResp.status, message: lastBody };
    } catch (e) {
      console.error("AI parse threw", (e as Error).message);
      if (attempt < delays.length) {
        await sleep(delays[attempt]);
        continue;
      }
      return { ok: false, reason: "error", message: (e as Error).message };
    }
  }

  return { ok: false, reason: "error", status: lastStatus, message: lastBody };
}

export function weightedScore(parsed: ParsedJob, profile: any): number {
  const w = profile ?? { weight_professional: 40, weight_culture: 20, weight_practical: 20, weight_enthusiasm: 20 };
  return Math.round(
    (parsed.score_professional * w.weight_professional +
      parsed.score_culture * w.weight_culture +
      parsed.score_practical * w.weight_practical +
      parsed.score_enthusiasm * w.weight_enthusiasm) / 100
  );
}
