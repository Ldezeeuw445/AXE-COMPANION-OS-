import { NextResponse, type NextRequest } from "next/server";
import { hasCronSecret } from "@/lib/auth/cronSecret";
import { ollamaTarget } from "@/lib/llm/ollamaClient";
import { parseOllamaEndpoints } from "@/lib/llm/ollamaEndpoints";

/**
 * GET /api/debug/chat-health
 *
 * Public: overall status + reachable booleans only (used by the smoke scripts).
 * With `Authorization: Bearer <CRON_SECRET>`: also model names, Ollama URL and
 * upstream error text — never exposed anonymously.
 */

const CHECK_TIMEOUT_MS = 6_000;

type ProviderCheck = {
  configured: boolean;
  reachable: boolean;
  error: string | null;
  responseTimeMs?: number;
};

async function probe(url: string, init?: RequestInit): Promise<ProviderCheck> {
  const start = Date.now();
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) });
    if (res.ok) return { configured: true, reachable: true, error: null, responseTimeMs: Date.now() - start };
    const text = await res.text().catch(() => "");
    return { configured: true, reachable: false, error: `HTTP ${res.status}: ${text.slice(0, 300)}` };
  } catch (err) {
    return { configured: true, reachable: false, error: err instanceof Error ? err.message : String(err) };
  }
}

const NOT_CONFIGURED: ProviderCheck = { configured: false, reachable: false, error: null };

export async function GET(request: NextRequest) {
  /* This route used to read OLLAMA_BASE_URL and default the model to
     "llama3.2", while the router reads OLLAMA_URL / OLLAMA_HOST and defaulted
     to "qwen3:4b". Two different variables and two different models: the
     health check could be green about an endpoint nothing ever called. It now
     asks the router's own resolver, so "reachable" means a chat would work. */
  const endpoints = parseOllamaEndpoints({
    OLLAMA_URL: process.env.OLLAMA_URL,
    OLLAMA_HOST: process.env.OLLAMA_HOST,
  });
  const target = await ollamaTarget(true);
  const openaiKey = process.env.OPENAI_API_KEY;
  const openaiModel = process.env.OPENAI_MODEL || "gpt-4o";

  const ollama: ProviderCheck = {
    configured: endpoints.length > 0,
    reachable: target !== null,
    error: target ? null : endpoints.length === 0
      ? "OLLAMA_URL is not set"
      : "no configured endpoint has a model that can chat",
  };

  const [openai] = await Promise.all([
    openaiKey
      ? probe("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${openaiKey}` } })
      : Promise.resolve(NOT_CONFIGURED),
  ]);

  const status = ollama.reachable
    ? "ok_ollama"
    : openai.reachable
      ? "ok_openai"
      : ollama.configured || openaiKey
        ? "partial"
        : "no_provider";
  const httpStatus = status === "no_provider" ? 503 : 200;

  if (!hasCronSecret(request.headers)) {
    return NextResponse.json(
      {
        status,
        ollama: { configured: ollama.configured, reachable: ollama.reachable },
        openai: { configured: openai.configured, reachable: openai.reachable },
      },
      { status: httpStatus, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    {
      status,
      env: {
        ollama_endpoints: endpoints,
        ollama_preferred_model: process.env.OLLAMA_MODEL ?? null,
        // What a chat would *actually* use right now, which is the only
        // number worth reporting.
        ollama_resolved: target,
        openai_key_set: !!openaiKey,
        openai_model: openaiModel,
      },
      ollama,
      openai,
    },
    { status: httpStatus, headers: { "Cache-Control": "no-store" } },
  );
}
