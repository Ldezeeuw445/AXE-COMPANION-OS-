import { NextResponse, type NextRequest } from "next/server";
import { hasCronSecret } from "@/lib/auth/cronSecret";

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
  const ollamaUrl = process.env.OLLAMA_BASE_URL;
  const ollamaModel = process.env.OLLAMA_MODEL || "llama3.2";
  const openaiKey = process.env.OPENAI_API_KEY;
  const openaiModel = process.env.OPENAI_MODEL || "gpt-4o";

  const [ollama, openai] = await Promise.all([
    ollamaUrl ? probe(`${ollamaUrl}/api/tags`) : Promise.resolve(NOT_CONFIGURED),
    openaiKey
      ? probe("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${openaiKey}` } })
      : Promise.resolve(NOT_CONFIGURED),
  ]);

  const status = ollama.reachable
    ? "ok_ollama"
    : openai.reachable
      ? "ok_openai"
      : ollamaUrl || openaiKey
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
        ollama_base_url: ollamaUrl || null,
        ollama_model: ollamaModel,
        openai_key_set: !!openaiKey,
        openai_model: openaiModel,
      },
      ollama,
      openai,
    },
    { status: httpStatus, headers: { "Cache-Control": "no-store" } },
  );
}
