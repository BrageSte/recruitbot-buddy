import { describe, expect, it, vi } from "vitest";
import { runAi, selectProvider } from "../../supabase/functions/_shared/ai.ts";
import { validateNorwegianDraft, findUnsupportedCvFacts } from "../../supabase/functions/_shared/no-quality-rules.ts";
import { writeApplicationTool } from "../../supabase/functions/_shared/prompts/application.ts";
import { tailorCvTool } from "../../supabase/functions/_shared/prompts/cv.ts";

const baseOptions = {
  feature: "generate_application",
  tier: "balanced" as const,
  system: "Du skriver norsk.",
  user: "Skriv kort.",
  tools: [{ name: "return_payload", parameters: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] } }],
  toolChoice: { name: "return_payload" },
};

describe("AI control plane", () => {
  it("routes feature defaults and explicit provider overrides", () => {
    expect(selectProvider("generate_application", { ANTHROPIC_API_KEY: "a", OPENAI_API_KEY: "o" })).toBe("anthropic");
    expect(selectProvider("tailor_cv", { ANTHROPIC_API_KEY: "a", OPENAI_API_KEY: "o" })).toBe("openai");
    expect(selectProvider("tailor_cv", { AI_PROVIDER__TAILOR_CV: "lovable", LOVABLE_API_KEY: "l", OPENAI_API_KEY: "o" })).toBe("lovable");
  });

  it("normalizes OpenAI function calls", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      output: [{ type: "function_call", name: "return_payload", arguments: "{\"ok\":true}", call_id: "call_1" }],
      usage: { input_tokens: 10, output_tokens: 3 },
    })));

    const result = await runAi({ ...baseOptions, env: { AI_PROVIDER: "openai", OPENAI_API_KEY: "key" }, fetcher });

    expect(fetcher).toHaveBeenCalledWith("https://api.openai.com/v1/responses", expect.any(Object));
    expect(result.toolCalls[0]).toMatchObject({ name: "return_payload", arguments: { ok: true } });
    expect(result.usage).toMatchObject({ provider: "openai", input: 10, output: 3 });
  });

  it("normalizes Anthropic tool calls", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      content: [{ type: "tool_use", id: "toolu_1", name: "return_payload", input: { ok: true } }],
      usage: { input_tokens: 7, output_tokens: 4 },
    })));

    const result = await runAi({ ...baseOptions, env: { AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "key" }, fetcher });

    expect(fetcher).toHaveBeenCalledWith("https://api.anthropic.com/v1/messages", expect.any(Object));
    expect(result.toolCalls[0]).toMatchObject({ name: "return_payload", arguments: { ok: true } });
    expect(result.usage).toMatchObject({ provider: "anthropic", input: 7, output: 4 });
  });

  it("normalizes Lovable/OpenAI-compatible tool calls", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { tool_calls: [{ id: "call_1", function: { name: "return_payload", arguments: "{\"ok\":true}" } }] } }],
      usage: { prompt_tokens: 5, completion_tokens: 2 },
    })));

    const result = await runAi({ ...baseOptions, env: { AI_PROVIDER: "lovable", LOVABLE_API_KEY: "key" }, fetcher });

    expect(fetcher).toHaveBeenCalledWith("https://ai.gateway.lovable.dev/v1/chat/completions", expect.any(Object));
    expect(result.toolCalls[0]).toMatchObject({ name: "return_payload", arguments: { ok: true } });
    expect(result.usage).toMatchObject({ provider: "lovable", input: 5, output: 2 });
  });
});

describe("AI quality contracts", () => {
  it("blocks banned Norwegian application cliches", () => {
    const result = validateNorwegianDraft("Jeg brenner for denne spennende muligheten, og jeg har erfaring som passer dere godt.", "private");

    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("jeg brenner for");
  });

  it("flags unsupported CV companies, institutions and certifications", () => {
    const original = {
      experiences: [{ company: "Acme", title: "Designer" }],
      education: [{ institution: "UiO", degree: "Bachelor" }],
      certifications: [{ name: "PMP", issuer: "PMI" }],
    };
    const tailored = {
      experiences: [{ company: "Globex", title: "Designer" }],
      education: [{ institution: "NTNU", degree: "Master" }],
      certifications: [{ name: "AWS Architect", issuer: "AWS" }],
    };

    expect(findUnsupportedCvFacts(tailored, original)).toEqual([
      "Ny arbeidsgiver i CV: Globex",
      "Ny utdanningsinstitusjon i CV: NTNU",
      "Ny sertifisering i CV: AWS Architect",
    ]);
  });

  it("keeps application and CV tools structured", () => {
    expect(writeApplicationTool.name).toBe("write_application");
    expect(writeApplicationTool.parameters.required).toEqual(["application_text", "cv_notes"]);
    expect(tailorCvTool.name).toBe("tailor_cv");
    expect(tailorCvTool.parameters.required).toContain("tailored_cv");
  });
});
