// Imports a CV from raw text or a PDF and returns structured CV JSON
// matching the cv_templates schema. Uses Lovable AI Gateway (Gemini) which
// supports PDF input natively as inline base64.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Du er en presis CV-parser. Du får en CV (som tekst eller PDF) og skal returnere ren JSON som matcher dette skjemaet eksakt:

{
  "full_name": string | null,
  "headline": string | null,
  "email": string | null,
  "phone": string | null,
  "location": string | null,
  "linkedin_url": string | null,
  "website_url": string | null,
  "intro": string,
  "experiences": Array<{
    "title": string, "company": string, "location"?: string,
    "start": string, "end"?: string, "current"?: boolean,
    "description"?: string, "bullets": string[], "technologies": string[]
  }>,
  "education": Array<{ "degree": string, "institution": string, "start": string, "end"?: string, "description"?: string }>,
  "skills": Array<{ "category": string, "items": string[] }>,
  "languages": Array<{ "name": string, "level": string }>,
  "projects": Array<{ "name": string, "description": string, "url"?: string, "technologies": string[] }>,
  "certifications": Array<{ "name": string, "issuer": string, "date"?: string, "url"?: string }>
}

Regler:
- Bevar originalspråket fra CV'en (typisk norsk).
- Datoer på formatet "YYYY-MM" der mulig, ellers "YYYY".
- Hvis nåværende stilling, sett "current": true og la "end" stå tom.
- Grupper ferdigheter i meningsfulle kategorier (f.eks. "Programmeringsspråk", "Verktøy", "Metodikk").
- "intro" = kort sammendrag/elevator pitch hvis CV'en har det, ellers tom streng.
- Ikke finn på data. Tomme arrays er greit.
- Returner KUN JSON, ingen forklaring, ingen markdown-kodeblokk.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY mangler" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { text, pdf_base64, mime_type } = body as {
      text?: string;
      pdf_base64?: string;
      mime_type?: string;
    };

    if (!text && !pdf_base64) {
      return new Response(
        JSON.stringify({ error: "Send enten 'text' eller 'pdf_base64'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Build user message content
    const userContent: any[] = [];
    if (text) {
      userContent.push({
        type: "text",
        text: `Parse denne CV-teksten til JSON:\n\n${text}`,
      });
    } else if (pdf_base64) {
      userContent.push({
        type: "text",
        text: "Parse denne CV-filen til JSON.",
      });
      userContent.push({
        type: "file",
        file: {
          filename: "cv.pdf",
          file_data: `data:${mime_type ?? "application/pdf"};base64,${pdf_base64}`,
        },
      });
    }

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("AI gateway error", aiRes.status, errText);
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit nådd, prøv igjen senere" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "AI-kreditt tom, fyll på i Lovable" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI-feil", detail: errText }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiRes.json();
    const content = aiJson.choices?.[0]?.message?.content;
    if (!content) {
      return new Response(JSON.stringify({ error: "Tomt AI-svar" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsed: any;
    try {
      parsed = typeof content === "string" ? JSON.parse(content) : content;
    } catch (_e) {
      // Try to recover JSON from a code-fenced response
      const match = String(content).match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
      else throw new Error("Klarte ikke parse JSON fra AI");
    }

    // Defensive defaults
    const cv = {
      full_name: parsed.full_name ?? null,
      headline: parsed.headline ?? null,
      email: parsed.email ?? null,
      phone: parsed.phone ?? null,
      location: parsed.location ?? null,
      linkedin_url: parsed.linkedin_url ?? null,
      website_url: parsed.website_url ?? null,
      intro: parsed.intro ?? "",
      experiences: Array.isArray(parsed.experiences) ? parsed.experiences : [],
      education: Array.isArray(parsed.education) ? parsed.education : [],
      skills: Array.isArray(parsed.skills) ? parsed.skills : [],
      languages: Array.isArray(parsed.languages) ? parsed.languages : [],
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
      certifications: Array.isArray(parsed.certifications) ? parsed.certifications : [],
    };

    return new Response(JSON.stringify({ cv }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("import-cv error", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
