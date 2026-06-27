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
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || process.env.OLLAMA_API_URL || 'https://ollama.axecompanion.com/api';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.1:8b';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

// Local model selection based on request type
const MODEL_FOR_CHAT = OLLAMA_MODEL; // Use configured Ollama model
const MODEL_FOR_INTEL = OLLAMA_MODEL; // Use configured Ollama model for intel too

// Timeouts — VPS Ollama can take 30–55s with tools + large system prompt
const OLLAMA_TIMEOUT_MS = 58000;
const OPENAI_TIMEOUT_MS = 30000;

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

  // If tools are present, use Ollama's OpenAI-compatible chat endpoint
  const hasTools = Array.isArray(request.tools) && request.tools.length > 0;
  if (hasTools) {
    try {
      return await callOllamaChat(request, { model, timeout });
    } catch (toolErr) {
      console.warn('[LLM] Ollama tool call failed, retrying without tools:', toolErr);
      const { tools: _tools, toolChoice: _toolChoice, ...rest } = request;
      return callOllamaChat({ ...rest, messages: request.messages }, { model, timeout });
    }
  }

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
        num_predict: request.max_tokens ?? 2048,
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
      messages: request.messages,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.max_tokens ?? 2048,
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

/**
 * Format chat messages for Ollama (which expects a prompt string)
 */
function formatMessagesForOllama(messages: LLMMessage[]): string {
  return messages
    .filter(msg => msg.role !== 'tool' && msg.content != null)
    .map(msg => {
      const raw = msg.content;
      const text = typeof raw === 'string' ? raw :
        Array.isArray(raw)
          ? raw.map(p => (typeof p === 'object' && p !== null && typeof (p as { text?: unknown }).text === 'string' ? (p as unknown as { text: string }).text : '')).join(' ')
          : '';
      const prefix = msg.role === 'user' ? 'User: ' : msg.role === 'system' ? 'System: ' : 'Assistant: ';
      return prefix + text;
    })
    .filter(Boolean)
    .join('\n\n') + '\n\nAssistant: ';
}

/**
 * Main LLM call with routing and fallback logic.
 * Supports tool/function calling when request.tools is provided.
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
    return callOllama(request, { model });
  }

  // 'auto' mode: try Ollama first, fallback to OpenAI on error
  try {
    return await callOllama(request, { model });
  } catch (ollamaError) {
    console.warn('[LLM] Ollama failed, falling back to OpenAI...');
    
    if (!OPENAI_API_KEY) {
      throw new Error(
        'Ollama failed and OpenAI fallback not configured. ' +
        'Set OPENAI_API_KEY or fix Ollama connectivity.'
      );
    }
    
    return callOpenAI(request);
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
): Promise<LLMResponse> {
  const hasTools = Array.isArray(request.tools) && request.tools.length > 0;

  // If tools are present, use non-streaming callLLM (tool rounds are not streamed)
  if (hasTools) {
    const result = await callLLM(request);
    if (result.content) onToken(result.content);
    return result;
  }

  if (LLM_TARGET === 'openai') {
    return streamOpenAITokens(request, onToken);
  }

  if (LLM_TARGET === 'ollama') {
    const result = await callLLM(request);
    if (result.content) onToken(result.content);
    return result;
  }

  // auto: Ollama first (via callLLM), then OpenAI streaming as fallback
  try {
    const result = await callLLM(request);
    if (result.content) onToken(result.content);
    return result;
  } catch (ollamaError) {
    console.warn('[LLM] Ollama failed in streamLLM, falling back to OpenAI streaming:', ollamaError);
    if (!OPENAI_API_KEY) throw ollamaError;
    return streamOpenAITokens(request, onToken);
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
