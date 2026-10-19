import { firstNonEmptyEnv } from "@/lib/envFallback";
import type OpenAI from "openai";
import {
  ollamaChat,
  ollamaChatStreaming,
  ollamaSimpleChat,
  ollamaSimpleChatStreaming,
  ollamaHealth,
  type OllamaToolCall,
} from "./ollamaClient";
import { parseOllamaEndpoints } from "./ollamaEndpoints";
import {
  openaiChat,
  openaiChatStreaming,
  openaiSimpleChat,
  openaiSimpleChatStreaming,
} from "./openaiClient";
import type { AxeResponse, AxeToolCall } from "@/services/axeService";

/**
 * LLM Router — tries Ollama first, falls back to OpenAI.
 *
 * Configuration:
 *   OLLAMA_URL            — one URL, or a comma/whitespace list in preference
 *                           order (e.g. always-on, then Mac Mini). Set the list
 *                           only after this resolver is live — older code treated
 *                           the whole string as a single address.
 *   OLLAMA_MODEL          — preferred model; if missing on the endpoint, a
 *                           chatable model that is present is chosen instead
 *   OPENAI_API_KEY        — existing OpenAI key
 *   LLM_FALLBACK_ENABLED  — true (default) to enable OpenAI fallback; false to fail fast on Ollama errors
 *
 * Strategy:
 *   1. If OLLAMA_URL is set, try Ollama first.
 *   2. If Ollama fails (timeout, connection error, 5xx, parse error), log and optionally fall back.
 *   3. If fallback is enabled and OPENAI_API_KEY is set, call OpenAI.
 *   4. If both fail, return the same empty/error shape the caller expects.
 *
 * For multimodal (image) requests, Ollama is skipped and OpenAI is used directly
 * because Ollama vision support is model-dependent and unreliable.
 */

// Accept both naming conventions — FALLBACK_TO_OPENAI and LLM_FALLBACK_ENABLED
const FALLBACK_ENABLED =
  (process.env.LLM_FALLBACK_ENABLED ?? process.env.FALLBACK_TO_OPENAI ?? "true").toLowerCase() !== "false";

/* ── Ollama health cache (30s TTL) ──────────────────────────────
   Avoids hammering a dead Ollama URL on every request.
   After a failure the router skips Ollama for 30 seconds.
   ─────────────────────────────────────────────────────────────── */
let _ollamaHealthy: boolean | null = null;
let _ollamaLastCheck = 0;
const OLLAMA_HEALTH_TTL = 30_000;

async function isOllamaReachable(): Promise<boolean> {
  // Same parser as the client and /api/debug/chat-health: a present-but-empty
  // var, or a host without a scheme, is "not configured" — not localhost.
  if (parseOllamaEndpoints(process.env).length === 0) return false;
  const now = Date.now();
  if (_ollamaHealthy !== null && now - _ollamaLastCheck < OLLAMA_HEALTH_TTL) {
    return _ollamaHealthy === true;
  }
  _ollamaHealthy = await ollamaHealth();
  _ollamaLastCheck = now;
  return _ollamaHealthy;
}

function invalidateOllamaCache() {
  _ollamaHealthy = false;
  _ollamaLastCheck = Date.now();
}

function hasMultimodalContent(
  messages: OpenAI.Chat.ChatCompletionMessageParam[]
): boolean {
  return messages.some(
    (m) =>
      m.role === "user" &&
      typeof m.content !== "string" &&
      Array.isArray(m.content) &&
      m.content.some((p) => p.type === "image_url")
  );
}

function ollamaToolsToAxeTools(tcs: OllamaToolCall[]): AxeToolCall[] {
  // The caller (axeService) validates tool names against VALID_TOOL_NAMES.
  // We just pass through what Ollama gave us.
  return tcs.map(
    (tc) =>
      ({
        id: tc.id,
        tool: tc.tool as AxeToolCall["tool"],
        args: tc.args,
      }) as AxeToolCall
  );
}

/* ── Chat with tools (non-streaming) ─────────────────────────── */

export async function llmChat(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  options: {
    tools?: OpenAI.Chat.ChatCompletionTool[];
    temperature?: number;
    maxTokens?: number;
  } = {}
): Promise<AxeResponse> {
  // Skip Ollama for multimodal — vision is unreliable
  const useOllama = !hasMultimodalContent(messages) && await isOllamaReachable();

  if (useOllama) {
    try {
      const res = await ollamaChat(messages, options);
      return {
        content: res.content,
        toolCalls: ollamaToolsToAxeTools(res.toolCalls),
      };
    } catch (err) {
      console.warn("[llmRouter] Ollama failed, falling back to OpenAI:", err);
      invalidateOllamaCache();
      if (!FALLBACK_ENABLED) {
        return { content: null, toolCalls: [] };
      }
      // fall through to OpenAI
    }
  }

  return openaiChat(messages, options);
}

/* ── Chat with tools (streaming) ─────────────────────────────── */

export async function llmChatStreaming(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  onToken: (text: string) => void,
  options: {
    tools?: OpenAI.Chat.ChatCompletionTool[];
    temperature?: number;
    maxTokens?: number;
  } = {}
): Promise<AxeResponse> {
  const useOllama = !hasMultimodalContent(messages) && await isOllamaReachable();

  if (useOllama) {
    try {
      const res = await ollamaChatStreaming(messages, onToken, options);
      return {
        content: res.content,
        toolCalls: ollamaToolsToAxeTools(res.toolCalls),
      };
    } catch (err) {
      console.warn("[llmRouter] Ollama streaming failed, falling back to OpenAI:", err);
      invalidateOllamaCache();
      if (!FALLBACK_ENABLED) {
        return { content: null, toolCalls: [] };
      }
      // fall through to OpenAI
    }
  }

  return openaiChatStreaming(messages, onToken, options);
}

/* ── Simple chat without tools (non-streaming) ───────────────── */

export async function llmSimpleChat(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  options: {
    temperature?: number;
    maxTokens?: number;
  } = {}
): Promise<string | null> {
  const useOllama = !hasMultimodalContent(messages) && await isOllamaReachable();

  if (useOllama) {
    try {
      return await ollamaSimpleChat(messages, options);
    } catch (err) {
      console.warn("[llmRouter] Ollama failed, falling back to OpenAI:", err);
      invalidateOllamaCache();
      if (!FALLBACK_ENABLED) return null;
    }
  }

  return openaiSimpleChat(messages, options);
}

/* ── Simple chat without tools (streaming) ───────────────────── */

export async function llmSimpleChatStreaming(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  onToken: (text: string) => void,
  options: {
    temperature?: number;
    maxTokens?: number;
  } = {}
): Promise<string | null> {
  const useOllama = !hasMultimodalContent(messages) && await isOllamaReachable();

  if (useOllama) {
    try {
      return await ollamaSimpleChatStreaming(messages, onToken, options);
    } catch (err) {
      console.warn("[llmRouter] Ollama streaming failed, falling back to OpenAI:", err);
      invalidateOllamaCache();
      if (!FALLBACK_ENABLED) return null;
    }
  }

  return openaiSimpleChatStreaming(messages, onToken, options);
}

/* ── Health check ──────────────────────────────────────────────── */

export async function llmHealth(): Promise<{ ollama: boolean; openai: boolean }> {
  const ollama = await ollamaHealth();
  const openai = firstNonEmptyEnv("OPENAI_API_KEY", "OPEN_AI_API_KEY") !== null;
  return { ollama, openai };
}
