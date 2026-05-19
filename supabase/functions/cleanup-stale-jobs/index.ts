import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, json } from "../_shared/full-match.ts";
import { cleanupStaleJobs } from "../_shared/stale-jobs.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const stats = await cleanupStaleJobs(admin, { dryRun: Boolean(body.dryRun) });
    return json(stats);
  } catch (e) {
    console.error("cleanup-stale-jobs error", e);
    return json({ error: (e as Error).message }, 500);
  }
});
