// Summarizes a job posting in 2-4 short Norwegian sentences and stores it in jobs.ai_summary.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYS = `Du oppsummerer stillingsannonser kort på norsk (bokmål).
Skriv 2-4 setninger som dekker:
- Hva rollen handler om
- Viktigste krav / ønskede ferdigheter
- Eventuelt noe spesielt (sektor, team, lokasjon, fjernarbeid, etc.)
Vær konkret og tydelig. Ikke gjenta tittel/selskap. Ingen punktliste, kun løpende tekst.`;

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
    const jobId = body?.jobId;
    if (!jobId) return json({ error: "jobId påkrevd" }, 400);

    const { data: job } = await supabase
      .from("jobs")
      .select("id, user_id, title, company, location, description, ai_summary")
      .eq("id", jobId)
      .maybeSingle();
    if (!job) return json({ error: "Jobb ikke funnet" }, 404);
    if (job.user_id !== user.id) return json({ error: "Ikke din jobb" }, 403);
    if (!job.description || job.description.trim().length < 30) {
      return json({ error: "Mangler annonsetekst å oppsummere" }, 400);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY mangler" }, 500);

    const ctx = `Tittel: ${job.title}\nSelskap: ${job.company ?? ""}\nSted: ${job.location ?? ""}\n\nAnnonsetekst:\n${job.description.slice(0, 8000)}`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYS },
          { role: "user", content: ctx },
        ],
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) return json({ error: "AI rate limit. Prøv igjen om litt." }, 429);
      if (aiResp.status === 402) return json({ error: "AI-kreditter brukt opp." }, 402);
      const t = await aiResp.text();
      console.error("AI error", aiResp.status, t);
      return json({ error: "AI-feil" }, 500);
    }

    const aiData = await aiResp.json();
    const summary: string = (aiData.choices?.[0]?.message?.content ?? "").trim();
    if (!summary) return json({ error: "Tom oppsummering" }, 500);

    await supabase.from("jobs").update({ ai_summary: summary }).eq("id", jobId);

    return json({ summary });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
