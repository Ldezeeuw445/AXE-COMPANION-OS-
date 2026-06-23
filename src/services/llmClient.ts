const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS ?? 15000);import OpenAI from "openai";
import type { AxeToolCall } from "./axeService";

/* ───────────────────────────────────────────────────────────────
   Unified LLM Client — Ollama (primary) + OpenAI (fallback)
   ───────────────────────────────────────────────────────────────

   Designed for AXE Companion's AI assistant.
   
   • Tries Ollama first (local/private, $0 per request)
   • Falls back to OpenAI automatically if Ollama fails
   • Supports streaming and tool calling for both providers
   • OLLAMA_HOST is fully configurable via env (for Cloudflare Tunnel)

   Environment variables:
     OLLAMA_HOST          — Ollama base URL (default: http://localhost:11434)
     OLLAMA_MODEL         — Model name (default: qwen2.5-coder:7b)
     OPENAI_API_KEY       — OpenAI API key (fallback)
     FALLBACK_TO_OPENAI   — "true" | "false" (default: true)
     OLLAMA_TIMEOUT_MS    — Timeout in ms (default: 15000)
   ─────────────────────────────────────────────────────────────── */

const OLLAMA_HOST = (process.env.OLLAMA_HOST ?? "http://localhost:11434").replace(/\/$/, "");
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen2.5-coder:7b";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? process.env.OPEN_AI_API_KEY;
const FALLBACK_TO_OPENAI = (process.env.FALLBACK_TO_OPENAI ?? "true") !== "false";
const CF_ACCESS_CLIENT_ID = process.env.CF_ACCESS_CLIENT_ID;
const CF_ACCESS_CLIENT_SECRET = process.env.CF_ACCESS_CLIENT_SECRET;

function getOllamaHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  // Only send Cloudflare Access headers when connecting to a Cloudflare Tunnel domain
  const isCloudflareTunnel = OLLAMA_HOST.includes(".axecompanion.com") || OLLAMA_HOST.includes("trycloudflare.com");
  if (isCloudflareTunnel && CF_ACCESS_CLIENT_ID && CF_ACCESS_CLIENT_SECRET) {
    headers["CF-Access-Client-Id"] = CF_ACCESS_CLIENT_ID;
    headers["CF-Access-Client-Secret"] = CF_ACCESS_CLIENT_SECRET;
  }
  return headers;
}

export type LLMChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string; detail?: string } }> }
  | { role: "assistant"; content: string | null; tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }> }
  | { role: "tool"; tool_call_id: string; content: string };

export type ChatCompletionParams = {
  messages: LLMChatMessage[];
  tools?: Array<{
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }>;
  toolChoice?: "auto" | "none";
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
};

export type ChatCompletionResult = {
  content: string | null;
  toolCalls: AxeToolCall[];
  provider: "ollama" | "openai" | null;
};

/* ── Helper: detect if messages contain images ─────────────── */
function hasImageContent(messages: LLMChatMessage[]): boolean {
  return messages.some((m) => {
    if (m.role !== "user") return false;
    if (typeof m.content === "string") return false;
    return m.content.some((part) => part.type === "image_url");
  });
}

/* ── Helper: strip images from messages (for non-vision models) */
function stripImages(messages: LLMChatMessage[]): LLMChatMessage[] {
  return messages.map((m) => {
    if (m.role !== "user" || typeof m.content === "string") return m;
    const textParts = m.content
      .filter((part) => part.type === "text")
      .map((part) => (part as { type: "text"; text: string }).text);
    return { role: "user", content: textParts.join(" ") + " [chart image omitted — non-vision model]" };
  });
}

/* ── Ollama: non-streaming chat completion ──────────────────── */
async function ollamaChatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResult> {
  const body: Record<string, unknown> = {
    model: OLLAMA_MODEL,
    messages: params.messages,
    stream: false,
    options: {
      temperature: params.temperature ?? 0.55,
      num_predict: params.maxTokens ?? 800,
    },
  };

  if (params.tools && params.tools.length > 0) {
    body.tools = params.tools;
    body.tool_choice = params.toolChoice ?? "auto";
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

  try {
    const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: "POST",
      headers: getOllamaHeaders(),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Ollama HTTP ${res.status}: ${text}`);
    }

    const data = (await res.json()) as {
      message?: {
        content?: string;
        tool_calls?: Array<{
          function: { name: string; arguments: Record<string, unknown> | string };
        }>;
      };
    };

    const message = data.message;
    if (!message) {
      return { content: null, toolCalls: [], provider: "ollama" };
    }

    // Parse tool calls
    const toolCalls: Array<{ id: string; tool: string; args: Record<string, unknown> }> = [];
    if (message.tool_calls && message.tool_calls.length > 0) {
      for (const tc of message.tool_calls) {
        const fn = tc.function;
        let args: Record<string, unknown>;
        if (typeof fn.arguments === "string") {
          try { args = JSON.parse(fn.arguments); } catch { args = {}; }
        } else {
          args = fn.arguments as Record<string, unknown>;
        }
        toolCalls.push({ id: `ollama-${Date.now()}-${toolCalls.length}`, tool: fn.name as AxeToolCall["tool"], args });
      }
    }

    return {
      content: message.content ?? null,
      toolCalls: toolCalls as AxeToolCall[],
      provider: "ollama",
    };
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/* ── Ollama: streaming chat completion ───────────────────────── */
async function ollamaChatCompletionStream(
  params: ChatCompletionParams,
  onToken: (text: string) => void
): Promise<ChatCompletionResult> {
  const body: Record<string, unknown> = {
    model: OLLAMA_MODEL,
    messages: params.messages,
    stream: true,
    options: {
      temperature: params.temperature ?? 0.55,
      num_predict: params.maxTokens ?? 800,
    },
  };

  if (params.tools && params.tools.length > 0) {
    body.tools = params.tools;
    body.tool_choice = params.toolChoice ?? "auto";
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

  try {
    const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: "POST",
      headers: getOllamaHeaders(),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Ollama HTTP ${res.status}: ${text}`);
    }

    if (!res.body) {
      throw new Error("Ollama response has no body");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let content = "";
    const pendingToolCalls: Array<{
      function: { name: string; arguments: Record<string, unknown> | string };
    }> = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n").filter((l) => l.trim());

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line) as {
            message?: {
              content?: string;
              tool_calls?: Array<{
                function: { name: string; arguments: Record<string, unknown> | string };
              }>;
            };
            done?: boolean;
          };

          if (parsed.message?.content) {
            content += parsed.message.content;
            onToken(parsed.message.content);
          }

          if (parsed.message?.tool_calls) {
            pendingToolCalls.push(...parsed.message.tool_calls);
          }
        } catch {
          // Ignore malformed JSON lines in stream
        }
      }
    }

    // Convert accumulated tool calls
    const toolCalls: Array<{ id: string; tool: string; args: Record<string, unknown> }> = [];
    if (pendingToolCalls.length > 0) {
      for (const tc of pendingToolCalls) {
        const fn = tc.function;
        let args: Record<string, unknown>;
        if (typeof fn.arguments === "string") {
          try { args = JSON.parse(fn.arguments); } catch { args = {}; }
        } else {
          args = fn.arguments as Record<string, unknown>;
        }
        toolCalls.push({ id: `ollama-${Date.now()}-${toolCalls.length}`, tool: fn.name as AxeToolCall["tool"], args });
      }
    }

    return {
      content: content || null,
      toolCalls: toolCalls as AxeToolCall[],
      provider: "ollama",
    };
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/* ── OpenAI: non-streaming chat completion ─────────────────── */
async function openaiChatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResult> {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not set");
  }

  const client = new OpenAI({ apiKey: OPENAI_API_KEY });

  const response = await client.chat.completions.create({
    model: "gpt-4o",
    messages: params.messages as OpenAI.Chat.ChatCompletionMessageParam[],
    tools: params.tools as OpenAI.Chat.ChatCompletionTool[] | undefined,
    tool_choice: params.toolChoice === "none" ? "none" : "auto",
    max_tokens: params.maxTokens ?? 800,
    temperature: params.temperature ?? 0.55,
  });

  const choice = response.choices[0];
  const rawToolCalls = choice.message.tool_calls ?? [];
  const toolCalls: AxeToolCall[] = [];

  for (const raw of rawToolCalls) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = (raw as any).function as { name: string; arguments: string };
    toolCalls.push({
      id: raw.id,
      tool: fn.name as AxeToolCall["tool"],
      args: JSON.parse(fn.arguments),
    });
  }

  return {
    content: choice.message.content ?? null,
    toolCalls,
    provider: "openai",
  };
}

/* ── OpenAI: streaming chat completion ─────────────────────── */
async function openaiChatCompletionStream(
  params: ChatCompletionParams,
  onToken: (text: string) => void
): Promise<ChatCompletionResult> {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not set");
  }

  const client = new OpenAI({ apiKey: OPENAI_API_KEY });

  const stream = await client.chat.completions.create({
    model: "gpt-4o",
    messages: params.messages as OpenAI.Chat.ChatCompletionMessageParam[],
    tools: params.tools as OpenAI.Chat.ChatCompletionTool[] | undefined,
    tool_choice: params.toolChoice === "none" ? "none" : "auto",
    max_tokens: params.maxTokens ?? 800,
    temperature: params.temperature ?? 0.55,
    stream: true,
  });

  let content = "";
  const pendingToolCalls = new Map<number, { id: string; name: string; args: string }>();

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta;
    if (!delta) continue;

    if (delta.content) {
      content += delta.content;
      onToken(delta.content);
    }

    if (delta.tool_calls) {
      for (const tc of delta.tool_calls) {
        const existing = pendingToolCalls.get(tc.index) ?? { id: "", name: "", args: "" };
        if (tc.id) existing.id = tc.id;
        if (tc.function?.name) existing.name += tc.function.name;
        if (tc.function?.arguments) existing.args += tc.function.arguments;
        pendingToolCalls.set(tc.index, existing);
      }
    }
  }

  const toolCalls: AxeToolCall[] = [];
  if (pendingToolCalls.size > 0) {
    for (const [, tc] of pendingToolCalls) {
      try {
        toolCalls.push({
          id: tc.id,
          tool: tc.name as AxeToolCall["tool"],
          args: JSON.parse(tc.args),
        });
      } catch {
        console.error("[llmClient] Failed to parse OpenAI streamed tool call:", tc);
      }
    }
  }

  return {
    content: content || null,
    toolCalls,
    provider: "openai",
  };
}

/* ── Public: unified chat completion with fallback ─────────── */
export async function chatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResult> {
  // If images are present but model is likely non-vision, strip them
  const needsVision = hasImageContent(params.messages);
  const isVisionModel = OLLAMA_MODEL.includes("vl") || OLLAMA_MODEL.includes("llava") || OLLAMA_MODEL.includes("vision");
  const adaptedParams = needsVision && !isVisionModel ? { ...params, messages: stripImages(params.messages) } : params;

  // Try Ollama first
  try {
    console.log(`[llmClient] Trying Ollama at ${OLLAMA_HOST} with model ${OLLAMA_MODEL}`);
    const result = await ollamaChatCompletion(adaptedParams);
    console.log(`[llmClient] Ollama success (provider: ${result.provider})`);
    return result;
  } catch (ollamaErr) {
    const errMsg = ollamaErr instanceof Error ? ollamaErr.message : String(ollamaErr);
    console.error(`[llmClient] Ollama failed: ${errMsg}`);

    // Fallback to OpenAI
    if (FALLBACK_TO_OPENAI && OPENAI_API_KEY) {
      console.log("[llmClient] Falling back to OpenAI...");
      try {
        const result = await openaiChatCompletion(params);
        console.log(`[llmClient] OpenAI fallback success (provider: ${result.provider})`);
        return result;
      } catch (openaiErr) {
        const openaiMsg = openaiErr instanceof Error ? openaiErr.message : String(openaiErr);
        console.error(`[llmClient] OpenAI fallback also failed: ${openaiMsg}`);
        throw new Error(`Both Ollama and OpenAI failed. Ollama: ${errMsg}. OpenAI: ${openaiMsg}`);
      }
    }

    throw new Error(`Ollama failed and fallback is disabled. Error: ${errMsg}`);
  }
}

/* ── Public: unified streaming chat completion with fallback ── */
export async function chatCompletionStream(
  params: ChatCompletionParams,
  onToken: (text: string) => void
): Promise<ChatCompletionResult> {
  // If images are present but model is likely non-vision, strip them
  const needsVision = hasImageContent(params.messages);
  const isVisionModel = OLLAMA_MODEL.includes("vl") || OLLAMA_MODEL.includes("llava") || OLLAMA_MODEL.includes("vision");
  const adaptedParams = needsVision && !isVisionModel ? { ...params, messages: stripImages(params.messages) } : params;

  // Try Ollama first
  try {
    console.log(`[llmClient] Trying Ollama streaming at ${OLLAMA_HOST} with model ${OLLAMA_MODEL}`);
    const result = await ollamaChatCompletionStream(adaptedParams, onToken);
    console.log(`[llmClient] Ollama streaming success (provider: ${result.provider})`);
    return result;
  } catch (ollamaErr) {
    const errMsg = ollamaErr instanceof Error ? ollamaErr.message : String(ollamaErr);
    console.error(`[llmClient] Ollama streaming failed: ${errMsg}`);

    // Fallback to OpenAI
    if (FALLBACK_TO_OPENAI && OPENAI_API_KEY) {
      console.log("[llmClient] Falling back to OpenAI streaming...");
      try {
        const result = await openaiChatCompletionStream(params, onToken);
        console.log(`[llmClient] OpenAI streaming fallback success (provider: ${result.provider})`);
        return result;
      } catch (openaiErr) {
        const openaiMsg = openaiErr instanceof Error ? openaiErr.message : String(openaiErr);
        console.error(`[llmClient] OpenAI streaming fallback also failed: ${openaiMsg}`);
        throw new Error(`Both Ollama and OpenAI streaming failed. Ollama: ${errMsg}. OpenAI: ${openaiMsg}`);
      }
    }

    throw new Error(`Ollama streaming failed and fallback is disabled. Error: ${errMsg}`);
  }
}
