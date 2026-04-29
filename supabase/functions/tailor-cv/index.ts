// Generates AI-tailored CV tweaks for a specific application,
// based on the user's CV template + the job description.
//
// Output now includes a fully-structured `tailored_cv` snapshot
// (same shape as cv_templates) plus a recommended `section_order`,
// so the application detail page can render a real PDF/preview
// in the same style as the cover letter.
//
// SAFETY: AI output is validated and filtered before being merged.
// Empty / malformed entries (e.g. `[{}]`) are dropped, and the
// original template values are kept for any field the AI did not
// supply meaningfully. This prevents render crashes on the client
// when the model returns junk-shaped objects.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYS = `Du tilpasser en CV til en spesifikk stilling. ABSOLUTT REGEL: Aldri finn på erfaring, utdanning, sertifiseringer eller ferdigheter som ikke finnes i mal-en.

Du SKAL produsere et komplett, strukturert "tailored_cv"-objekt med samme felter som mal-en. Strukturen MÅ matche mal-en eksakt:
- experiences[]: { title, company, location?, start, end?, current?, description?, bullets?: string[], technologies?: string[] }
- education[]:   { degree, institution, start, end?, description? }
- skills[]:      { category: string, items: string[] }   ← items MÅ være en array av strenger
- languages[]:   { name: string, level: string }
- projects[]:    { name, description, url?, technologies?: string[] }
- certifications[]: { name, issuer, date?, url? }

Du har lov til å:
- Omformulere intro, beskrivelser og bullet points slik at de treffer stillingen bedre.
- Endre rekkefølgen på elementer i listene.
- Utelate enkeltelementer som er åpenbart irrelevante.
- Justere "section_order" slik at de viktigste avsnittene kommer først.

CV-kvalitet og PDF-sikkerhet:
- Tenk klassisk CV, ikke kampanje/landing page: rolig struktur, tydelige seksjoner, korte punkter.
- Ikke lag lange avsnitt inni bullets. Bruk konkrete, lesbare setninger.
- Behold kronologi og kontekst slik at leseren forstår arbeidsgiver, rolle og tidsrom.
- Ikke bruk markdown, emoji eller visuell pynt i structured JSON-feltene.
- Ikke returner ekstremt lange URL-er eller kontakttekst i nye felt.

ABSOLUTT FORBUDT:
- Returnere tomme objekter ({}) i listene.
- Hoppe over obligatoriske felt som title/company i experiences eller category/items i skills.
- Returnere "items" som noe annet enn en array av strenger.

Hvis du ikke har noe meningsfylt å returnere for et avsnitt, returner en tom array [] for det avsnittet — IKKE [{}].

I tillegg skal du levere korte AI-anbefalinger og en markdown-versjon for arkiv. Svar på norsk.`;
const STYLE_RULES = `Språkregler: skriv konkret, arbeidsgiverrettet og uten floskler. Ikke bruk "jeg brenner for", "lidenskapelig opptatt av" eller tom entusiasme.`;

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

    const { applicationId } = await req.json();
    if (!applicationId) return json({ error: "applicationId påkrevd" }, 400);

    const [{ data: app }, { data: profile }] = await Promise.all([
      supabase.from("applications").select("*, jobs(*)").eq("id", applicationId).maybeSingle(),
      supabase.from("profiles").select("master_profile, style_guide").eq("user_id", user.id).maybeSingle(),
    ]);
    if (!app) return json({ error: "Søknad ikke funnet" }, 404);

    let cv: any = null;
    if (app.cv_template_id) {
      const { data } = await supabase.from("cv_templates").select("*").eq("id", app.cv_template_id).maybeSingle();
      cv = data;
    }
    if (!cv) {
      const { data } = await supabase
        .from("cv_templates")
        .select("*")
        .eq("user_id", user.id)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      cv = data;
    }
    if (!cv) return json({ error: "Du må opprette en CV-mal først." }, 400);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY mangler" }, 500);

    const ctx = `CV-MAL (JSON):\n${JSON.stringify(cv, null, 2)}\n\nMASTER-PROFIL:\n${profile?.master_profile ?? ""}\n\nSTIL-GUIDE:\n${profile?.style_guide ?? ""}\n\nSTILLING:\nTittel: ${app.jobs.title}\nSelskap: ${app.jobs.company ?? ""}\nBeskrivelse:\n${app.jobs.description ?? ""}\nAI-oppsummering: ${app.jobs.ai_summary ?? ""}`;

    // Stricter schema — each list item now has required fields.
    // Many models (Gemini included) need the required hint to avoid
    // returning placeholder empty objects.
    const tailoredCvSchema = {
      type: "object",
      description: "Tilpasset CV-snapshot. Kun ekte data fra mal-en, omformulert/sortert/filtrert. Bruk tomme arrays [], aldri [{}].",
      properties: {
        intro: { type: "string" },
        headline: { type: "string" },
        experiences: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              company: { type: "string" },
              location: { type: "string" },
              start: { type: "string" },
              end: { type: "string" },
              current: { type: "boolean" },
              description: { type: "string" },
              bullets: { type: "array", items: { type: "string" } },
              technologies: { type: "array", items: { type: "string" } },
            },
            required: ["title", "company"],
          },
        },
        education: {
          type: "array",
          items: {
            type: "object",
            properties: {
              degree: { type: "string" },
              institution: { type: "string" },
              start: { type: "string" },
              end: { type: "string" },
              description: { type: "string" },
            },
            required: ["degree", "institution"],
          },
        },
        skills: {
          type: "array",
          items: {
            type: "object",
            properties: {
              category: { type: "string" },
              items: { type: "array", items: { type: "string" } },
            },
            required: ["category", "items"],
          },
        },
        languages: {
          type: "array",
          items: {
            type: "object",
            properties: { name: { type: "string" }, level: { type: "string" } },
            required: ["name", "level"],
          },
        },
        projects: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              description: { type: "string" },
              url: { type: "string" },
              technologies: { type: "array", items: { type: "string" } },
            },
            required: ["name", "description"],
          },
        },
        certifications: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              issuer: { type: "string" },
              date: { type: "string" },
              url: { type: "string" },
            },
            required: ["name", "issuer"],
          },
        },
      },
      required: ["intro"],
    };

    const tool = {
      type: "function",
      function: {
        name: "tailor_cv",
        parameters: {
          type: "object",
          properties: {
            tailored_cv: tailoredCvSchema,
            section_order: {
              type: "array",
              items: { type: "string", enum: ["experiences", "education", "skills", "languages", "projects", "certifications"] },
            },
            tailored_intro: { type: "string" },
            highlight_experiences: { type: "array", items: { type: "string" } },
            deemphasize: { type: "array", items: { type: "string" } },
            prioritize_skills: { type: "array", items: { type: "string" } },
            rephrase_suggestions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  context: { type: "string" },
                  before: { type: "string" },
                  after: { type: "string" },
                },
                required: ["context", "before", "after"],
              },
            },
            tailored_cv_markdown: { type: "string" },
            notes: { type: "string" },
          },
          required: ["tailored_cv", "section_order", "tailored_intro", "highlight_experiences", "deemphasize", "prioritize_skills", "rephrase_suggestions", "tailored_cv_markdown"],
        },
      },
    };

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: `${SYS}\n\n${STYLE_RULES}` },
          { role: "user", content: ctx },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "tailor_cv" } },
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
    const call = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) return json({ error: "AI returnerte ikke struktur" }, 500);

    let parsed: any;
    try {
      parsed = JSON.parse(call.function.arguments);
    } catch (e) {
      console.error("Failed to parse AI output", e, call.function.arguments);
      return json({ error: "AI returnerte ugyldig JSON" }, 500);
    }

    // ---- Validation helpers ----
    const arr = (v: any): any[] => (Array.isArray(v) ? v : []);
    const str = (v: any): string => (typeof v === "string" ? v.trim() : "");
    const strArr = (v: any): string[] => arr(v).filter((x) => typeof x === "string" && x.trim());

    const validExperiences = arr(parsed.tailored_cv?.experiences)
      .map((e) => ({
        title: str(e?.title),
        company: str(e?.company),
        location: str(e?.location) || undefined,
        start: str(e?.start),
        end: str(e?.end) || undefined,
        current: e?.current === true ? true : undefined,
        description: str(e?.description) || undefined,
        bullets: strArr(e?.bullets),
        technologies: strArr(e?.technologies),
      }))
      .filter((e) => e.title || e.company);

    const validEducation = arr(parsed.tailored_cv?.education)
      .map((e) => ({
        degree: str(e?.degree),
        institution: str(e?.institution),
        start: str(e?.start),
        end: str(e?.end) || undefined,
        description: str(e?.description) || undefined,
      }))
      .filter((e) => e.degree || e.institution);

    const validSkills = arr(parsed.tailored_cv?.skills)
      .map((g) => ({ category: str(g?.category), items: strArr(g?.items) }))
      .filter((g) => g.category && g.items.length);

    const validLanguages = arr(parsed.tailored_cv?.languages)
      .map((l) => ({ name: str(l?.name), level: str(l?.level) }))
      .filter((l) => l.name);

    const validProjects = arr(parsed.tailored_cv?.projects)
      .map((p) => ({
        name: str(p?.name),
        description: str(p?.description),
        url: str(p?.url) || undefined,
        technologies: strArr(p?.technologies),
      }))
      .filter((p) => p.name || p.description);

    const validCertifications = arr(parsed.tailored_cv?.certifications)
      .map((c) => ({
        name: str(c?.name),
        issuer: str(c?.issuer),
        date: str(c?.date) || undefined,
        url: str(c?.url) || undefined,
      }))
      .filter((c) => c.name || c.issuer);

    // Build snapshot starting from the original template (keeps contact info,
    // styling, and any list the AI did not return validly).
    const baseSnapshot: any = {
      full_name: cv.full_name,
      headline: cv.headline,
      email: cv.email,
      phone: cv.phone,
      location: cv.location,
      linkedin_url: cv.linkedin_url,
      website_url: cv.website_url,
      photo_url: cv.photo_url,
      cv_style: cv.cv_style,
      intro: cv.intro,
      experiences: cv.experiences,
      education: cv.education,
      skills: cv.skills,
      languages: cv.languages,
      projects: cv.projects,
      certifications: cv.certifications,
    };

    const tailoredCv: any = { ...baseSnapshot };

    // Only overwrite a section if the AI returned at least one valid entry.
    // Empty arrays from the AI mean "AI explicitly cleared this" — but we are
    // conservative and keep the original to avoid accidentally hiding info.
    const aiIntro = str(parsed.tailored_cv?.intro) || str(parsed.tailored_intro);
    if (aiIntro) tailoredCv.intro = aiIntro;
    const aiHeadline = str(parsed.tailored_cv?.headline);
    if (aiHeadline) tailoredCv.headline = aiHeadline;
    if (validExperiences.length) tailoredCv.experiences = validExperiences;
    if (validEducation.length) tailoredCv.education = validEducation;
    if (validSkills.length) tailoredCv.skills = validSkills;
    if (validLanguages.length) tailoredCv.languages = validLanguages;
    if (validProjects.length) tailoredCv.projects = validProjects;
    if (validCertifications.length) tailoredCv.certifications = validCertifications;

    const ALLOWED_SECTIONS = ["experiences", "education", "skills", "languages", "projects", "certifications"];
    const cleanSectionOrder = arr(parsed.section_order).filter(
      (k) => typeof k === "string" && ALLOWED_SECTIONS.includes(k),
    );

    const { data: tweak, error } = await supabase.from("application_cv_tweaks")
      .upsert({
        user_id: user.id,
        application_id: applicationId,
        tailored_intro: aiIntro || cv.intro || null,
        highlight_experiences: strArr(parsed.highlight_experiences),
        deemphasize: strArr(parsed.deemphasize),
        prioritize_skills: strArr(parsed.prioritize_skills),
        rephrase_suggestions: arr(parsed.rephrase_suggestions),
        tailored_cv_markdown: str(parsed.tailored_cv_markdown) || null,
        tailored_cv: tailoredCv,
        section_order: cleanSectionOrder.length ? cleanSectionOrder : (cv.section_order ?? null),
        notes: str(parsed.notes) || null,
      } as any, { onConflict: "application_id" })
      .select().maybeSingle();
    if (error) return json({ error: error.message }, 500);

    return json({ tweak });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
