// Picks the best CV style for a given job based on description + company.
// Called when generating an application; falls back to the user's default style.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STYLES = ["skandinavisk", "korporat", "akademisk", "startup", "bold"] as const;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { jobId, applicationId } = await req.json();
    if (!jobId && !applicationId) return j({ error: "jobId or applicationId required" }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let resolvedJobId = jobId as string | undefined;
    let resolvedAppId = applicationId as string | undefined;

    if (resolvedAppId && !resolvedJobId) {
      const { data: app } = await admin.from("applications").select("job_id").eq("id", resolvedAppId).maybeSingle();
      resolvedJobId = app?.job_id;
    }
    if (!resolvedJobId) return j({ error: "could not resolve job" }, 400);

    const { data: job } = await admin.from("jobs").select("title,company,description,location").eq("id", resolvedJobId).maybeSingle();
    if (!job) return j({ error: "job not found" }, 404);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    let chosen: typeof STYLES[number] = "skandinavisk";

    if (LOVABLE_API_KEY) {
      const tool = {
        type: "function",
        function: {
          name: "pick_style",
          description: "Velg den CV-stilen som best matcher selskapet og bransjen.",
          parameters: {
            type: "object",
            properties: {
              style: { type: "string", enum: STYLES as unknown as string[] },
              reason: { type: "string" },
            },
            required: ["style", "reason"],
          },
        },
      };

      const sys = `Du velger CV-stil for en søker. Stiler:
- skandinavisk: lys, ren, lite farge — offentlig, bærekraft, helse, NGO.
- korporat: klassisk, blått, formelt — finans, jus, konsulent, store selskaper.
- akademisk: serif, tett tekst — forskning, universitet, undervisning.
- startup: moderne, lilla aksent, sidebar — scaleups, produkt, tech.
- bold: stor tittel, sterk farge — design, media, kreative bransjer.
Svar med tool-call.`;

      const userMsg = `STILLING: ${job.title}\nSELSKAP: ${job.company ?? ""}\nLOKASJON: ${job.location ?? ""}\n\nBESKRIVELSE:\n${(job.description ?? "").slice(0, 4000)}`;

      try {
        const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              { role: "system", content: sys },
              { role: "user", content: userMsg },
            ],
            tools: [tool],
            tool_choice: { type: "function", function: { name: "pick_style" } },
          }),
        });
        if (aiResp.status === 429) return j({ error: "Rate limits exceeded, please try again later." }, 429);
        if (aiResp.status === 402) return j({ error: "Payment required, please add funds to your Lovable AI workspace." }, 402);
        if (aiResp.ok) {
          const data = await aiResp.json();
          const call = data.choices?.[0]?.message?.tool_calls?.[0];
          if (call) {
            const parsed = JSON.parse(call.function.arguments);
            if (STYLES.includes(parsed.style)) chosen = parsed.style;
          }
        }
      } catch (e) {
        console.error("ai pick failed", e);
      }
    }

    if (resolvedAppId) {
      await admin.from("applications").update({ cv_style: chosen }).eq("id", resolvedAppId);
    }

    return j({ style: chosen });
  } catch (e) {
    console.error("pick-cv-style error", e);
    return j({ error: (e as Error).message }, 500);
  }
});

function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
