import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYS = `Du er en karriere-coach som lager realistiske ukentlige delmål for jobbsøking. Vær konkret, motiverende og ærlig. Svar alltid på norsk via tool-kallet.`;

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

    const { targetDate, weeklyApps } = await req.json();
    if (!targetDate) return json({ error: "targetDate påkrevd" }, 400);

    const today = new Date();
    const target = new Date(targetDate);
    const weeks = Math.max(1, Math.ceil((target.getTime() - today.getTime()) / (7 * 24 * 3600 * 1000)));

    // Context: profile + recent application stats
    const { data: profile } = await supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
    const { count: sentLast30 } = await supabase
      .from("applications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .not("sent_at", "is", null)
      .gte("sent_at", new Date(Date.now() - 30 * 86400_000).toISOString());

    const { count: discoveredJobs } = await supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "discovered");

    const desiredWeekly = weeklyApps ?? profile?.weekly_goal ?? 5;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY mangler" }, 500);

    const tool = {
      type: "function",
      function: {
        name: "build_plan",
        description: "Returnerer en ukentlig fremdriftsplan",
        parameters: {
          type: "object",
          properties: {
            headline: { type: "string", description: "Kort motiverende overskrift, f.eks. 'Få jobb innen uke 32'" },
            summary: { type: "string", description: "1-2 setninger om planen og hvorfor den er realistisk" },
            milestones: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  week_offset: { type: "integer", description: "0 = denne uken, 1 = neste uke, osv." },
                  title: { type: "string", description: "Kort tittel, f.eks. 'Send 5 søknader'" },
                  description: { type: "string" },
                  target_count: { type: "integer", description: "Antall (søknader/intervjuer) for uken" },
                },
                required: ["week_offset", "title", "target_count"],
                additionalProperties: false,
              },
            },
          },
          required: ["headline", "summary", "milestones"],
          additionalProperties: false,
        },
      },
    };

    const userMsg = `Lag en ukentlig plan for å nå målet "Få jobb innen ${targetDate}".

KONTEKST:
- I dag: ${today.toISOString().split("T")[0]}
- Uker til mål: ${weeks}
- Ønsket søketempo: ${desiredWeekly} søknader/uke
- Sendt siste 30 dager: ${sentLast30 ?? 0}
- Jobber tilgjengelig (oppdaget): ${discoveredJobs ?? 0}
- Profil: ${profile?.master_profile?.slice(0, 500) ?? "ikke utfylt"}

Lag ${Math.min(weeks, 12)} ukentlige delmål. Tidlige uker: fokus på volum (søknader). Senere uker: oppfølging og intervju-forberedelse. Vær realistisk – ikke sett 10 søknader/uke hvis det ikke finnes nok jobber.`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYS },
          { role: "user", content: userMsg },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "build_plan" } },
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) return json({ error: "AI rate limit" }, 429);
      if (aiResp.status === 402) return json({ error: "AI-kreditter brukt opp" }, 402);
      const t = await aiResp.text();
      console.error("AI error", aiResp.status, t);
      return json({ error: "AI-feil" }, 500);
    }

    const aiData = await aiResp.json();
    const call = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) return json({ error: "AI returnerte ikke struktur" }, 500);
    const plan = JSON.parse(call.function.arguments);

    // Wipe existing AI-generated active goals
    await supabase
      .from("goals")
      .delete()
      .eq("user_id", user.id)
      .eq("ai_generated", true)
      .eq("status", "active");

    // Insert main goal
    const { data: mainGoal, error: mainErr } = await supabase
      .from("goals")
      .insert({
        user_id: user.id,
        kind: "target_date",
        title: plan.headline,
        description: plan.summary,
        target_date: targetDate,
        ai_generated: true,
        sort_order: 0,
      })
      .select()
      .maybeSingle();
    if (mainErr || !mainGoal) return json({ error: mainErr?.message ?? "Klarte ikke lagre hovedmål" }, 500);

    // Insert milestones
    const milestoneRows = (plan.milestones ?? []).map((m: any, idx: number) => {
      const d = new Date(today);
      d.setDate(d.getDate() + m.week_offset * 7);
      // align to end of that week (Sunday)
      const day = d.getDay();
      const diffToSun = (7 - day) % 7;
      d.setDate(d.getDate() + diffToSun);
      return {
        user_id: user.id,
        parent_goal_id: mainGoal.id,
        kind: "milestone",
        title: m.title,
        description: m.description ?? null,
        target_date: d.toISOString().split("T")[0],
        target_count: m.target_count,
        ai_generated: true,
        sort_order: idx + 1,
      };
    });
    if (milestoneRows.length > 0) {
      await supabase.from("goals").insert(milestoneRows);
    }

    return json({ mainGoal, milestonesCreated: milestoneRows.length, plan });
  } catch (e) {
    console.error("generate-plan error", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
