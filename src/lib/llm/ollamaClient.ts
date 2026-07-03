/**
 * Ollama client for llmRouter.
 * Connects to the user's local/tunnelled Ollama instance.
 */
import type OpenAI from "openai";
import type { AxeResponse, AxeToolCall } from "@/services/axeService";

export type OllamaToolCall = {
  id: string;
  tool: string;
  args: Record<string, unknown>;
};

type OllamaResult = { content: string | null; toolCalls: OllamaToolCall[] };

const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen3:4b";

function baseUrl(): string {
  return (
    process.env.OLLAMA_URL ??
    process.env.OLLAMA_HOST ??
    "http://localhost:11434"
  ).replace(/\/$/, "");
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

export async function ollamaHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl()}/api/tags`, {
      signal: AbortSignal.timeout(5_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function ollamaChat(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  options: { temperature?: number; maxTokens?: number } = {}
): Promise<OllamaResult> {
  const res = await fetch(`${baseUrl()}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: messagesToOllama(messages),
      stream: false,
      options: {
        temperature: options.temperature ?? 0.7,
        num_predict: options.maxTokens ?? 1024,
      },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
  const json = (await res.json()) as { message?: { content?: string } };
  return { content: json?.message?.content ?? null, toolCalls: [] };
}

export async function ollamaChatStreaming(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  onToken: (text: string) => void,
  options: { temperature?: number; maxTokens?: number } = {}
): Promise<OllamaResult> {
  const res = await fetch(`${baseUrl()}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
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
