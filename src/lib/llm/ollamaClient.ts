/**
 * Ollama client for llmRouter.
 * Connects to the user's local/tunnelled Ollama instance.
 */
import type OpenAI from "openai";
import type { AxeResponse, AxeToolCall } from "@/services/axeService";
import {
  parseOllamaEndpoints,
  resolveOllamaTarget,
  type OllamaTarget,
} from "@/lib/llm/ollamaEndpoints";

export type OllamaToolCall = {
  id: string;
  tool: string;
  args: Record<string, unknown>;
};

type OllamaResult = { content: string | null; toolCalls: OllamaToolCall[] };

/* ── Which endpoint, which model ───────────────────────────────────────────
   OLLAMA_URL may hold several addresses in preference order. The model is a
   *preference*: if the endpoint does not have it we take one it does have,
   because the alternative — what used to happen — is a health check that
   says "reachable" while every chat comes back "model not found".
   Resolved once per minute, not per request.
   ───────────────────────────────────────────────────────────────────────── */

const PREFERRED_MODEL = process.env.OLLAMA_MODEL ?? "qwen3:4b";
const TARGET_TTL = 60_000;

let _target: OllamaTarget | null = null;
let _targetAt = 0;

function endpoints(): string[] {
  const configured = parseOllamaEndpoints(process.env);
  // Keep the old behaviour for a local dev box with nothing configured.
  return configured.length > 0 ? configured : ["http://localhost:11434"];
}

async function listModels(url: string): Promise<string[] | null> {
  try {
    const res = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return null;
    const json = (await res.json()) as { models?: Array<{ name?: string }> };
    return (json.models ?? []).map((m) => m.name ?? "").filter(Boolean);
  } catch {
    return null;
  }
}

/** The endpoint and model to use now, or null when none can serve a chat. */
export async function ollamaTarget(force = false): Promise<OllamaTarget | null> {
  const now = Date.now();
  if (!force && _target && now - _targetAt < TARGET_TTL) return _target;
  _target = await resolveOllamaTarget(endpoints(), PREFERRED_MODEL, listModels);
  _targetAt = now;
  return _target;
}

export function invalidateOllamaTarget(): void {
  _target = null;
  _targetAt = 0;
}

function messagesToOllama(
  messages: OpenAI.Chat.ChatCompletionMessageParam[]
): Array<{ role: string; content: string }> {
  return messages.flatMap((m) => {
    const role = m.role === "system" ? "system" : m.role === "assistant" ? "assistant" : "user";
    if (typeof m.content === "string") return [{ role, content: m.content }];
    if (Array.isArray(m.content)) {
      const text = (m.content as Array<{ type: string; text?: string }>)
        .filter((p) => p.type === "text")
        .map((p) => p.text ?? "")
        .join("");
      return [{ role, content: text }];
    }
    return [];
  });
}

/**
 * True only when some endpoint is up *and* holds a model that can chat.
 *
 * The old version returned `res.ok` on /api/tags. Measured 2026-10-17: that
 * returned true against a server whose twelve models did not include the
 * configured one, so the router reported ok_ollama and every chat silently
 * became an OpenAI call.
 */
export async function ollamaHealth(): Promise<boolean> {
  return (await ollamaTarget()) !== null;
}

export async function ollamaChat(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  options: { temperature?: number; maxTokens?: number } = {}
): Promise<OllamaResult> {
  const target = await ollamaTarget();
  if (!target) throw new Error("Ollama: no endpoint has a usable chat model");
  const res = await fetch(`${target.url}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: target.model,
      // Measured 2026-10-17: qwen3:4b spent its whole token budget in
      // `thinking` and returned content:"" with done_reason:"length". AXE
      // would have rendered a blank reply. Ollama ignores this on models that
      // cannot think, so it is safe to always send.
      think: false,
      messages: messagesToOllama(messages),
      stream: false,
      options: {
        temperature: options.temperature ?? 0.7,
        num_predict: options.maxTokens ?? 1024,
      },
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    // 524 is Cloudflare giving up on a proxied origin after ~100s — a cold
    // model load on the Mac Mini outlasts it. The body is then HTML, so say
    // which it was rather than failing on a JSON parse further down.
    throw new Error(
      res.status === 524
        ? `Ollama timed out loading a model at ${target.url} (Cloudflare 524)`
        : `Ollama error: ${res.status}`,
    );
  }
  const json = (await res.json()) as { message?: { content?: string } };
  const content = json?.message?.content ?? null;
  // Empty content is a failure, not an answer. Returning it would show the
  // trader a blank message instead of falling back to a provider that works.
  if (!content || !content.trim()) {
    throw new Error(`Ollama returned an empty reply from ${target.model}`);
  }
  return { content, toolCalls: [] };
}

export async function ollamaChatStreaming(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  onToken: (text: string) => void,
  options: { temperature?: number; maxTokens?: number } = {}
): Promise<OllamaResult> {
  const target = await ollamaTarget();
  if (!target) throw new Error("Ollama: no endpoint has a usable chat model");
  const res = await fetch(`${target.url}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: target.model,
      think: false,
      messages: messagesToOllama(messages),
      stream: true,
      options: {
        temperature: options.temperature ?? 0.7,
        num_predict: options.maxTokens ?? 1024,
      },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`Ollama streaming error: ${res.status}`);
  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");
  const decoder = new TextDecoder();
  let full = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const line of decoder.decode(value).split("\n")) {
      if (!line.trim()) continue;
      try {
        const j = JSON.parse(line) as { message?: { content?: string }; done?: boolean };
        const tok = j?.message?.content ?? "";
        if (tok) { onToken(tok); full += tok; }
      } catch { /* skip */ }
    }
  }
  return { content: full || null, toolCalls: [] };
}

export async function ollamaSimpleChat(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  options: { temperature?: number; maxTokens?: number } = {}
): Promise<string | null> {
  const r = await ollamaChat(messages, options);
  return r.content;
}

export async function ollamaSimpleChatStreaming(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  onToken: (text: string) => void,
  options: { temperature?: number; maxTokens?: number } = {}
): Promise<string | null> {
  const r = await ollamaChatStreaming(messages, onToken, options);
  return r.content;
}

// Re-export AxeResponse shape for consumers that import via llmRouter
export type { AxeResponse, AxeToolCall };
