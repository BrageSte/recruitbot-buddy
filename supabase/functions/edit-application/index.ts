import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Du er en presis tekstredaktør for norske jobbsøknader. Brukeren gir deg gjeldende søknadstekst og en instruksjon på naturlig språk (f.eks. "gjør avsnittet om erfaring mer personlig", "fjern alle bindestreker", "kortere og mer direkte").

Regler:
- Du returnerer KUN den fullstendige, oppdaterte søknadsteksten — ingen forklaringer, ingen overskrifter, ingen markdown-kodeblokker, ingen "Her er den nye teksten:".
- Behold avsnittsstruktur og linjeskift med mindre instruksjonen ber om noe annet.
- Behold språk (norsk bokmål med mindre originalen er noe annet).
- Ikke finn på fakta som ikke står i originalen eller i jobbkonteksten.
- Hvis brukeren markerer kun et utvalg av teksten (mellom <SELECTION>...</SELECTION>), endre KUN den delen og bytt den ut i hele teksten — returner hele dokumentet.
- Hvis instruksjonen er uklar, gjør den mest sannsynlige tolkningen og utfør endringen.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { currentText, instruction, selection, jobTitle, company, jobDescription } = await req.json();

    if (typeof currentText !== "string" || !currentText.trim()) {
      return new Response(JSON.stringify({ error: "currentText er påkrevd" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (typeof instruction !== "string" || !instruction.trim()) {
      return new Response(JSON.stringify({ error: "instruction er påkrevd" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY ikke konfigurert");

    const userParts: string[] = [];
    if (jobTitle || company) {
      userParts.push(`Stilling: ${jobTitle ?? "(ukjent)"}${company ? ` hos ${company}` : ""}`);
    }
    if (jobDescription) {
      userParts.push(`\nJobbeskrivelse (kontekst, ikke for sitering):\n${String(jobDescription).slice(0, 2000)}`);
    }

    if (selection && typeof selection === "string" && selection.trim() && currentText.includes(selection)) {
      userParts.push(`\nGjeldende søknadstekst:\n${currentText}`);
      userParts.push(`\nKun denne delen skal endres (resten beholdes ordrett):\n<SELECTION>${selection}</SELECTION>`);
    } else {
      userParts.push(`\nGjeldende søknadstekst:\n${currentText}`);
    }
    userParts.push(`\nInstruksjon fra bruker:\n${instruction.trim()}`);
    userParts.push(`\nReturner hele den oppdaterte søknadsteksten — ingenting annet.`);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userParts.join("\n") },
        ],
      }),
    });

    if (response.status === 429) {
      return new Response(JSON.stringify({ error: "For mange forespørsler – prøv igjen om litt." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (response.status === 402) {
      return new Response(JSON.stringify({ error: "AI-kreditt brukt opp – legg til kreditt i Lovable Cloud." }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!response.ok) {
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI-feil" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    let newText: string = data?.choices?.[0]?.message?.content ?? "";

    // Strip accidental markdown fences
    newText = newText.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```\s*$/, "").trim();

    if (!newText) {
      return new Response(JSON.stringify({ error: "Tomt svar fra AI" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ newText }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("edit-application error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Ukjent feil" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
