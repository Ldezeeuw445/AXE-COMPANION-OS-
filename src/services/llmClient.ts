/**
 * LLM Client — Routes between Ollama (local) and OpenAI (fallback)
 * 
 * Configuration:
 * - LLM_TARGET: 'ollama' | 'openai' | 'auto' (default: 'auto')
 * - OLLAMA_API_URL: https://ollama.axecompanion.com/api (or http://localhost:11434/api)
 * - OPENAI_API_KEY: sk-...
 * 
 * Behavior:
 * - 'auto': Try Ollama first, fallback to OpenAI on timeout/error
 * - 'ollama': Ollama only, fail if unreachable
 * - 'openai': OpenAI only
 */

/** A single chat message — mirrors OpenAI's ChatCompletionMessageParam shape */
export interface LLMMessage {
  role: string;
  content: string | null | Array<{ type: string; [key: string]: unknown }>;
  tool_calls?: Array<{
    id: string;
    type: string;
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
}

export interface LLMRequest {
  messages: LLMMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  /** Tool definitions forwarded to OpenAI function-calling */
  tools?: unknown[];
  toolChoice?: string;
}

export interface LLMResponse {
  content: string | null;
  model: string;
  provider: 'ollama' | 'openai';
  latency_ms: number;
  error?: string;
  toolCalls: Array<{ id: string; tool: string; args: Record<string, unknown> }>;
}

type LLMTarget = 'ollama' | 'openai' | 'auto';

// Configuration
const LLM_TARGET = (process.env.LLM_TARGET || 'auto') as LLMTarget;
// Support both OLLAMA_BASE_URL (new) and OLLAMA_API_URL (legacy)
const OLLAMA_BASE_URL_RAW = process.env.OLLAMA_BASE_URL || process.env.OLLAMA_API_URL || 'https://ollama.axecompanion.com';
/** Strip trailing /api so paths are consistent (/api/generate, /v1/chat/completions). */
const OLLAMA_BASE_URL = OLLAMA_BASE_URL_RAW.replace(/\/api\/?$/, '');
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.1:8b';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

// Local model selection based on request type
const MODEL_FOR_CHAT = OLLAMA_MODEL; // Use configured Ollama model
const MODEL_FOR_INTEL = OLLAMA_MODEL; // Use configured Ollama model for intel too

// Timeouts — VPS Ollama with compact prompts; extended when maxDuration=300
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS) || 240_000;
const OPENAI_TIMEOUT_MS = 30_000;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isOpenAIQuotaError(err: unknown): boolean {
  const msg = errorMessage(err).toLowerCase();
  return msg.includes('429') || msg.includes('quota') || msg.includes('billing');
}

function isOpenAIUnavailable(err: unknown): boolean {
  const msg = errorMessage(err).toLowerCase();
  return isOpenAIQuotaError(err) || msg.includes('401') || msg.includes('invalid api key');
}

function messageText(content: LLMMessage['content']): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((p) =>
        typeof p === 'object' && p !== null && typeof (p as { text?: unknown }).text === 'string'
          ? String((p as { text?: unknown }).text)
          : '',
      )
      .join(' ');
  }
  return '';
}

/** Compact messages for Ollama chat — keeps tool rounds but trims huge system blocks. */
function compactMessagesForOllamaChat(messages: LLMMessage[]): LLMMessage[] {
  return messages.map((msg) => {
    if (msg.role === 'system') {
      const text = truncateForOllama(messageText(msg.content), 3600);
      return { ...msg, content: text };
    }
    if (msg.role === 'user' || msg.role === 'assistant') {
      const max = msg.role === 'user' ? 1400 : 1000;
      const text = truncateForOllama(messageText(msg.content), max);
      return { ...msg, content: text || msg.content };
    }
    return msg;
  });
}

/** User-facing message when auto mode exhausts both providers. */
function buildAutoModeFailure(ollamaError: unknown, openaiError: unknown): Error {
  const ollamaMsg = errorMessage(ollamaError);
  const openaiMsg = errorMessage(openaiError);
  const openaiQuota = openaiMsg.includes('429') || openaiMsg.toLowerCase().includes('quota');
  const ollamaTimeout = ollamaMsg.toLowerCase().includes('aborted') || ollamaMsg.toLowerCase().includes('timeout');

  if (openaiQuota && ollamaTimeout) {
    return new Error(
      'AI unavailable: Ollama timed out and OpenAI quota is exhausted. Refill OpenAI billing or fix the Ollama VPS.',
    );
  }
  if (openaiQuota) {
    return new Error('OpenAI quota exceeded — refill billing or rely on Ollama (check VPS connectivity).');
  }
  if (ollamaTimeout) {
    return new Error(`Ollama timed out after ${Math.round(OLLAMA_TIMEOUT_MS / 1000)}s and OpenAI fallback failed: ${openaiMsg}`);
  }
  return new Error(`Ollama: ${ollamaMsg}. OpenAI fallback: ${openaiMsg}`);
}

interface CallOllamaOptions {
  model?: string;
  timeout?: number;
}

async function callOllama(
  request: LLMRequest,
  options: CallOllamaOptions = {}
): Promise<LLMResponse> {
  const startTime = Date.now();
  const model = options.model || MODEL_FOR_CHAT;
  const timeout = options.timeout || OLLAMA_TIMEOUT_MS;

  // Use /api/generate for all Ollama calls — faster on VPS than chat/completions
  // with large AXE system prompts. Tool schemas are omitted; OpenAI handles tools
  // only when explicitly selected via LLM_TARGET=openai.
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: formatMessagesForOllama(request.messages),
        stream: false,
        temperature: request.temperature ?? 0.7,
        num_predict: Math.min(request.max_tokens ?? 512, 512),
        keep_alive: '15m',
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { response?: string };
    const latency_ms = Date.now() - startTime;

    console.log(`[LLM] Ollama (${model}) responded in ${latency_ms}ms`);

    return {
      content: data.response || '',
      model,
      provider: 'ollama',
      latency_ms,
      toolCalls: [],
    };
  } catch (error) {
    const latency_ms = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    console.warn(`[LLM] Ollama failed after ${latency_ms}ms: ${errorMessage}`);
    
    throw new Error(`Ollama error: ${errorMessage}`);
  }
}

async function callOpenAI(
  request: LLMRequest,
  timeout: number = OPENAI_TIMEOUT_MS
): Promise<LLMResponse> {
  const startTime = Date.now();

  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // Build request body — include tools when present (enables function calling)
    const bodyPayload: Record<string, unknown> = {
      model: OPENAI_MODEL,
      messages: request.messages,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.max_tokens ?? 2048,
    };

    const tools = request.tools as unknown[] | undefined;
    if (tools && tools.length > 0) {
      bodyPayload.tools = tools;
      bodyPayload.tool_choice = request.toolChoice ?? 'auto';
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify(bodyPayload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText} — ${errBody.slice(0, 200)}`);
    }

    const data = await response.json() as {
      choices?: Array<{
        message?: {
          content?: string | null;
          tool_calls?: Array<{
            id: string;
            type: string;
            function: { name: string; arguments: string };
          }>;
        };
      }>;
    };
    const latency_ms = Date.now() - startTime;

    const message = data.choices?.[0]?.message;
    const content = message?.content ?? null;

    // Parse tool calls from OpenAI response
    const rawToolCalls = message?.tool_calls ?? [];
    const toolCalls = rawToolCalls
      .filter((tc) => tc?.function?.name)
      .map((tc) => ({
        id: tc.id || `tc_${Math.random().toString(36).slice(2)}`,
        tool: tc.function.name,
        args: (() => {
          try {
            return JSON.parse(tc.function.arguments ?? '{}') as Record<string, unknown>;
          } catch {
            return {} as Record<string, unknown>;
          }
        })(),
      }));

    console.log(`[LLM] OpenAI (${OPENAI_MODEL}) responded in ${latency_ms}ms — ${toolCalls.length} tool call(s)`);

    return {
      content,
      model: OPENAI_MODEL,
      provider: 'openai',
      latency_ms,
      toolCalls,
    };
  } catch (error) {
    const latency_ms = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    console.error(`[LLM] OpenAI failed after ${latency_ms}ms: ${errorMessage}`);
    
    throw new Error(`OpenAI error: ${errorMessage}`);
  }
}

/**
 * Call Ollama's OpenAI-compatible chat completions endpoint.
 * Supports tool/function calling.
 */
async function callOllamaChat(
  request: LLMRequest,
  options: CallOllamaOptions = {}
): Promise<LLMResponse> {
  const startTime = Date.now();
  const model = options.model || MODEL_FOR_CHAT;
  const timeout = options.timeout || OLLAMA_TIMEOUT_MS;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const bodyPayload: Record<string, unknown> = {
      model,
      messages: compactMessagesForOllamaChat(request.messages),
      temperature: request.temperature ?? 0.7,
      max_tokens: Math.min(request.max_tokens ?? 800, 800),
    };

    const tools = request.tools as unknown[] | undefined;
    if (tools && tools.length > 0) {
      bodyPayload.tools = tools;
      bodyPayload.tool_choice = request.toolChoice ?? 'auto';
    }

    const response = await fetch(`${OLLAMA_BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ollama', // Ollama accepts any key for the compatible endpoint
      },
      body: JSON.stringify(bodyPayload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new Error(`Ollama chat API error: ${response.status} ${response.statusText} — ${errBody.slice(0, 200)}`);
    }

    const data = await response.json() as {
      choices?: Array<{
        message?: {
          content?: string | null;
          tool_calls?: Array<{
            id: string;
            type: string;
            function: { name: string; arguments: string };
          }>;
        };
      }>;
    };
    const latency_ms = Date.now() - startTime;

    const message = data.choices?.[0]?.message;
    const content = message?.content ?? null;

    const rawToolCalls = message?.tool_calls ?? [];
    const toolCalls = rawToolCalls
      .filter((tc) => tc?.function?.name)
      .map((tc) => ({
        id: tc.id || `tc_${Math.random().toString(36).slice(2)}`,
        tool: tc.function.name,
        args: (() => {
          try {
            return JSON.parse(tc.function.arguments ?? '{}') as Record<string, unknown>;
          } catch {
            return {} as Record<string, unknown>;
          }
        })(),
      }));

    console.log(`[LLM] Ollama chat (${model}) responded in ${latency_ms}ms — ${toolCalls.length} tool call(s)`);

    return {
      content,
      model,
      provider: 'ollama',
      latency_ms,
      toolCalls,
    };
  } catch (error) {
    const latency_ms = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.warn(`[LLM] Ollama chat failed after ${latency_ms}ms: ${errorMessage}`);

    throw new Error(`Ollama chat error: ${errorMessage}`);
  }
}

/**
 * Select the appropriate model based on request context
 */
function selectModel(requestType: 'chat' | 'intel'): string {
  return requestType === 'intel' ? MODEL_FOR_INTEL : MODEL_FOR_CHAT;
}

function truncateForOllama(text: string, max = 2800): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n[context truncated for local model]`;
}

/**
 * Format chat messages for Ollama (which expects a prompt string).
 * Truncates large AXE system blocks so VPS inference stays within Vercel limits.
 */
function formatMessagesForOllama(messages: LLMMessage[]): string {
  const usable = messages.filter((msg) => msg.role !== 'tool' && msg.content != null);
  const system = usable.find((msg) => msg.role === 'system');
  const turns = usable.filter((msg) => msg.role !== 'system').slice(-10);

  const toText = (msg: LLMMessage, maxLen: number) => {
    const raw = msg.content;
    const text =
      typeof raw === 'string'
        ? raw
        : Array.isArray(raw)
          ? raw
              .map((p) =>
                typeof p === 'object' && p !== null && typeof (p as { text?: unknown }).text === 'string'
                  ? String((p as { text?: unknown }).text)
                  : '',
              )
              .join(' ')
          : '';
    return truncateForOllama(text, maxLen);
  };

  const parts: string[] = [];
  if (system) {
    parts.push(`System: ${toText(system, 3200)}`);
  }
  for (const msg of turns) {
    const prefix = msg.role === 'user' ? 'User: ' : msg.role === 'assistant' ? 'Assistant: ' : `${msg.role}: `;
    parts.push(prefix + toText(msg, msg.role === 'user' ? 1200 : 900));
  }
  return `${parts.join('\n\n')}\n\nAssistant: `;
}

/**
 * Main LLM call with routing and fallback logic.
 * Supports tool/function calling when request.tools is provided.
 *
 * auto + tools: OpenAI first → Ollama chat (tools) on failure
 * auto + text:  Ollama generate → OpenAI on failure
 * ollama:        chat API when tools, generate otherwise
 */
export async function callLLM(
  request: LLMRequest,
  requestType: 'chat' | 'intel' = 'chat'
): Promise<LLMResponse> {
  const model = selectModel(requestType);

  console.log(`[LLM] Request type: ${requestType}, target: ${LLM_TARGET}, model: ${model}`);

  const hasTools = Array.isArray(request.tools) && request.tools.length > 0;

  if (LLM_TARGET === 'openai') {
    return callOpenAI(request);
  }

  if (LLM_TARGET === 'ollama') {
    return hasTools ? callOllamaChat(request, { model }) : callOllama(request, { model });
  }

  // auto mode
  if (hasTools) {
    if (OPENAI_API_KEY) {
      try {
        return await callOpenAI(request);
      } catch (openaiError) {
        console.warn('[LLM] OpenAI tools failed, falling back to Ollama chat:', errorMessage(openaiError));
        try {
          return await callOllamaChat(request, { model });
        } catch (ollamaError) {
          throw buildAutoModeFailure(ollamaError, openaiError);
        }
      }
    }
    console.log('[LLM] No OpenAI key — Ollama chat with tools');
    return callOllamaChat(request, { model });
  }

  try {
    return await callOllama(request, { model });
  } catch (ollamaError) {
    console.warn('[LLM] Ollama failed, falling back to OpenAI...');

    if (!OPENAI_API_KEY) {
      throw ollamaError instanceof Error ? ollamaError : new Error(String(ollamaError));
    }

    try {
      return await callOpenAI(request);
    } catch (openaiError) {
      throw buildAutoModeFailure(ollamaError, openaiError);
    }
  }
}

/**
 * Stream response from LLM via OpenAI streaming API (preferred) or Ollama.
 * Calls onToken for each text chunk as it arrives.
 * Returns the full LLMResponse (content + toolCalls) once complete.
 */
export async function streamLLM(
  request: LLMRequest,
  onToken: (text: string) => void,
  requestType: 'chat' | 'intel' = 'chat',
): Promise<LLMResponse> {
  const hasTools = Array.isArray(request.tools) && request.tools.length > 0;

  // Tool rounds use callLLM (non-streaming provider call)
  if (hasTools) {
    const result = await callLLM(request, requestType);
    if (result.content) onToken(result.content);
    return result;
  }

  if (LLM_TARGET === 'openai') {
    return streamOpenAITokens(request, onToken);
  }

  if (LLM_TARGET === 'ollama') {
    const result = await callLLM(request, requestType);
    if (result.content) onToken(result.content);
    return result;
  }

  // auto: Ollama generate first, OpenAI streaming fallback
  try {
    const result = await callLLM(request, requestType);
    if (result.content) onToken(result.content);
    return result;
  } catch (ollamaError) {
    console.warn('[LLM] Ollama failed in streamLLM, falling back to OpenAI streaming:', ollamaError);
    if (!OPENAI_API_KEY) throw ollamaError;
    try {
      return await streamOpenAITokens(request, onToken);
    } catch (openaiError) {
      throw buildAutoModeFailure(ollamaError, openaiError);
    }
  }
}

/**
 * True token-by-token streaming via OpenAI's streaming completions API.
 */
async function streamOpenAITokens(
  request: LLMRequest,
  onToken: (text: string) => void,
): Promise<LLMResponse> {
  const startTime = Date.now();

  if (!OPENAI_API_KEY) throw new Error('OpenAI API key not configured');

  const bodyPayload: Record<string, unknown> = {
    model: OPENAI_MODEL,
    messages: request.messages,
    temperature: request.temperature ?? 0.7,
    max_tokens: request.max_tokens ?? 2048,
    stream: true,
  };

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(bodyPayload),
  });

  if (!response.ok) {
    throw new Error(`OpenAI streaming error: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';
  let fullContent = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') break;

      try {
        const parsed = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const token = parsed.choices?.[0]?.delta?.content;
        if (token) {
          fullContent += token;
          onToken(token);
        }
      } catch {
        // malformed chunk — skip
      }
    }
  }

  return {
    content: fullContent || null,
    model: OPENAI_MODEL,
    provider: 'openai',
    latency_ms: Date.now() - startTime,
    toolCalls: [],
  };
}

async function* streamOllama(
  request: LLMRequest,
  options: CallOllamaOptions = {}
) {
  const model = options.model || MODEL_FOR_CHAT;

  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: formatMessagesForOllama(request.messages),
        stream: true,
        temperature: request.temperature ?? 0.7,
        num_predict: request.max_tokens ?? 2048,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(Boolean);
      
      for (const line of lines) {
        const data = JSON.parse(line) as { response?: string };
        if (data.response) {
          yield data.response;
        }
      }
    }
  } catch (error) {
    console.error('[LLM] Ollama streaming failed:', error);
    throw error;
  }
}

// Suppress unused-variable warning — generator kept for future Ollama streaming
void streamOllama;

// Types are already exported inline above; re-export LLMTarget which has no inline export
export type { LLMTarget };
