import { NextResponse } from "next/server";

export async function GET() {
  const ollamaUrl = process.env.OLLAMA_BASE_URL;
  const ollamaModel = process.env.OLLAMA_MODEL || "llama3.2";
  const openaiKey = process.env.OPENAI_API_KEY;
  const openaiModel = process.env.OPENAI_MODEL || "gpt-4o";

  const results = {
    status: "checking",
    env: {
      ollama_base_url: ollamaUrl || null,
      ollama_model: ollamaModel,
      openai_key_set: !!openaiKey,
      openai_model: openaiModel,
    },
    ollama: { configured: false, reachable: false, error: null as string | null },
    openai: { configured: false, reachable: false, error: null as string | null },
  };

  // Check Ollama with a simple fetch
  if (ollamaUrl) {
    results.ollama.configured = true;
    try {
      const start = Date.now();
      const res = await fetch(`${ollamaUrl}/api/tags`, { method: "GET" });
      if (res.ok) {
        results.ollama.reachable = true;
        results.ollama.error = null;
        results.ollama.responseTimeMs = Date.now() - start;
      } else {
        results.ollama.reachable = false;
        results.ollama.error = `HTTP ${res.status}: ${await res.text()}`;
      }
    } catch (err) {
      results.ollama.reachable = false;
      results.ollama.error = err instanceof Error ? err.message : String(err);
    }
  }

  // Check OpenAI with a simple fetch
  if (openaiKey) {
    results.openai.configured = true;
    try {
      const start = Date.now();
      const res = await fetch("https://api.openai.com/v1/models", {
        method: "GET",
        headers: { Authorization: `Bearer ${openaiKey}` },
      });
      if (res.ok) {
        results.openai.reachable = true;
        results.openai.error = null;
        results.openai.responseTimeMs = Date.now() - start;
      } else {
        results.openai.reachable = false;
        results.openai.error = `HTTP ${res.status}: ${await res.text()}`;
      }
    } catch (err) {
      results.openai.reachable = false;
      results.openai.error = err instanceof Error ? err.message : String(err);
    }
  }

  // Determine overall status
  if (results.ollama.reachable) {
    results.status = "ok_ollama";
  } else if (results.openai.reachable) {
    results.status = "ok_openai";
  } else if (ollamaUrl || openaiKey) {
    results.status = "partial";
  } else {
    results.status = "no_provider";
    return NextResponse.json(results, { status: 503 });
  }

  return NextResponse.json(results);
}
