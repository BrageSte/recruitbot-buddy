import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_CHARS = 120_000;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let supabase: any = null;
  let attachmentId = "";

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Mangler auth" }, 401);

    supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) return json({ error: "Ikke autentisert" }, 401);

    const body = await req.json().catch(() => ({}));
    attachmentId = String(body.attachmentId ?? "").trim();
    if (!attachmentId) return json({ error: "attachmentId påkrevd" }, 400);

    const { data: attachment, error: attachmentError } = await supabase
      .from("application_attachments")
      .select("*")
      .eq("id", attachmentId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (attachmentError) return json({ error: attachmentError.message }, 500);
    if (!attachment) return json({ error: "Vedlegg ikke funnet" }, 404);

    await supabase
      .from("application_attachments")
      .update({ extraction_status: "extracting", extraction_error: null })
      .eq("id", attachmentId)
      .eq("user_id", user.id);

    if ((attachment.size_bytes ?? 0) > MAX_BYTES) {
      return await fail(supabase, attachmentId, user.id, "Filen er for stor. Maks 10 MB.", 400);
    }

    const download = await supabase.storage.from("user-files").download(attachment.storage_path);
    if (download.error || !download.data) {
      return await fail(supabase, attachmentId, user.id, download.error?.message ?? "Kunne ikke lese fil", 500);
    }

    const bytes = new Uint8Array(await download.data.arrayBuffer());
    const mimeType = String(attachment.mime_type ?? "");
    const fileName = String(attachment.file_name ?? "");
    const isPdf = mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");
    const isText =
      mimeType.startsWith("text/")
      || fileName.toLowerCase().endsWith(".txt")
      || fileName.toLowerCase().endsWith(".md")
      || fileName.toLowerCase().endsWith(".markdown");

    if (!isPdf && !isText) {
      return await fail(supabase, attachmentId, user.id, "V1 støtter bare PDF, TXT og Markdown.", 400);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return await fail(supabase, attachmentId, user.id, "LOVABLE_API_KEY mangler", 500);

    let extractedText = "";
    let summary = "";

    if (isText) {
      extractedText = new TextDecoder("utf-8").decode(bytes).slice(0, MAX_TEXT_CHARS).trim();
      summary = await summarizeText(LOVABLE_API_KEY, extractedText, fileName);
    } else {
      const extracted = await extractPdfText(LOVABLE_API_KEY, fileName, mimeType || "application/pdf", bytes);
      extractedText = extracted.text.slice(0, MAX_TEXT_CHARS).trim();
      summary = extracted.summary;
    }

    if (!extractedText) {
      return await fail(supabase, attachmentId, user.id, "Fant ikke lesbar tekst i vedlegget.", 400);
    }

    const { data: updated, error: updateError } = await supabase
      .from("application_attachments")
      .update({
        extracted_text: extractedText,
        ai_summary: summary || fallbackSummary(extractedText),
        extraction_status: "ready",
        extraction_error: null,
      })
      .eq("id", attachmentId)
      .eq("user_id", user.id)
      .select()
      .maybeSingle();

    if (updateError) return json({ error: updateError.message }, 500);
    return json({ attachment: updated });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Ukjent feil";
    if (supabase && attachmentId) {
      try {
        await supabase.from("application_attachments").update({
          extraction_status: "failed",
          extraction_error: message,
        }).eq("id", attachmentId);
      } catch (_err) {
        // Best effort only.
      }
    }
    console.error("extract-application-attachment error", e);
    return json({ error: message }, 500);
  }
});

async function extractPdfText(apiKey: string, fileName: string, mimeType: string, bytes: Uint8Array) {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content:
            "Du trekker ut tekst fra søknadsvedlegg. Returner kun JSON med feltene text og summary. Ikke legg til fakta som ikke står i filen.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Trekk ut all lesbar tekst fra PDF-en og lag en kort norsk oppsummering på maks 3 setninger." },
            {
              type: "file",
              file: {
                filename: fileName || "vedlegg.pdf",
                file_data: `data:${mimeType};base64,${bytesToBase64(bytes)}`,
              },
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) throw new Error(await aiErrorMessage(response));
  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  const parsed = parseJsonContent(content);
  return {
    text: String(parsed.text ?? ""),
    summary: String(parsed.summary ?? ""),
  };
}

async function summarizeText(apiKey: string, text: string, fileName: string) {
  if (!text.trim()) return "";

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content:
            "Du oppsummerer søknadsvedlegg for senere bruk i jobbsøknad. Svar kun JSON med feltet summary. Ikke legg til fakta.",
        },
        {
          role: "user",
          content: `Filnavn: ${fileName}\n\nTekst:\n${text.slice(0, 16000)}\n\nLag en kort norsk oppsummering på maks 3 setninger.`,
        },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) return fallbackSummary(text);
  const data = await response.json();
  const parsed = parseJsonContent(data?.choices?.[0]?.message?.content);
  return String(parsed.summary ?? "").trim();
}

async function fail(supabase: any, attachmentId: string, userId: string, message: string, status = 500) {
  await supabase
    .from("application_attachments")
    .update({ extraction_status: "failed", extraction_error: message })
    .eq("id", attachmentId)
    .eq("user_id", userId);

  return json({ error: message }, status);
}

async function aiErrorMessage(response: Response) {
  if (response.status === 429) return "AI rate limit. Prøv igjen om litt.";
  if (response.status === 402) return "AI-kreditter brukt opp.";
  const text = await response.text();
  console.error("AI gateway error:", response.status, text);
  return "AI-feil";
}

function parseJsonContent(content: unknown): any {
  if (!content) return {};
  if (typeof content !== "string") return content;

  try {
    return JSON.parse(content);
  } catch (_e) {
    const match = content.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : {};
  }
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function fallbackSummary(text: string) {
  return text.trim().replace(/\s+/g, " ").slice(0, 280);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
