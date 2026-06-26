import { NextResponse } from "next/server";
import { getAIConfig, createAIClient, getModelForProvider } from "@/services/aiProvider";

type ProviderResult = {
  configured: boolean;
  reachable: boolean;
  error: string | null;
  responseTimeMs?: number;
};

type HealthResults = {
  status: string;
  primary: string;
  model: string;
  ollama: ProviderResult;
  openai: ProviderResult;
};

export async function GET() {
  const config = getAIConfig();

  if (!config) {
    return NextResponse.json(
      {
        status: "no_provider_configured",
        message: "Set OLLAMA_BASE_URL or OPENAI_API_KEY in environment variables",
        ollama: { configured: false, reachable: false, error: null },
        openai: { configured: false, reachable: false, error: null },
      },
      { status: 503 }
    );
  }

  const results: HealthResults = {
    status: "checking",
    primary: config.provider,
    model: config.model,
    ollama: { configured: false, reachable: false, error: null },
    openai: { configured: false, reachable: false, error: null },
  };

  // Check Ollama if configured
  if (process.env.OLLAMA_BASE_URL) {
    results.ollama.configured = true;
    try {
      const ollamaClient = createAIClient({
        provider: "ollama",
        baseURL: process.env.OLLAMA_BASE_URL,
        model: process.env.OLLAMA_MODEL || "llama3.2",
      });

      const model = getModelForProvider({
        provider: "ollama",
        baseURL: process.env.OLLAMA_BASE_URL,
        model: process.env.OLLAMA_MODEL || "llama3.2",
      });

      const start = Date.now();
      await ollamaClient.chat.completions.create({
        model,
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 5,
      });

      results.ollama.reachable = true;
      results.ollama.error = null;
      results.ollama.responseTimeMs = Date.now() - start;
    } catch (err) {
      results.ollama.reachable = false;
      results.ollama.error = err instanceof Error ? err.message : String(err);
    }
  }

  // Check OpenAI if configured
  if (process.env.OPENAI_API_KEY) {
    results.openai.configured = true;
    try {
      const openaiClient = createAIClient({
        provider: "openai",
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      });

      const model = getModelForProvider({
        provider: "openai",
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      });

      const start = Date.now();
      await openaiClient.chat.completions.create({
        model,
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 5,
      });

      results.openai.reachable = true;
      results.openai.error = null;
      results.openai.responseTimeMs = Date.now() - start;
    } catch (err) {
      results.openai.reachable = false;
      results.openai.error = err instanceof Error ? err.message : String(err);
    }
  }

  // Determine overall status
  if (config.provider === "ollama" && results.ollama.reachable) {
    results.status = "ok_ollama";
  } else if (config.provider === "openai" && results.openai.reachable) {
    results.status = "ok_openai";
  } else if (results.openai.reachable) {
    results.status = "fallback_openai";
  } else if (results.ollama.reachable) {
    results.status = "fallback_ollama";
  } else {
    results.status = "all_failed";
    return NextResponse.json(results, { status: 503 });
  }

  return NextResponse.json(results);
}
