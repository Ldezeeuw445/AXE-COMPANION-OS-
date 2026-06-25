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

interface LLMRequest {
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

interface LLMResponse {
  content: string;
  model: string;
  provider: 'ollama' | 'openai';
  latency_ms: number;
  error?: string;
}

type LLMTarget = 'ollama' | 'openai' | 'auto';

// Configuration
const LLM_TARGET = (process.env.LLM_TARGET || 'auto') as LLMTarget;
const OLLAMA_API_URL = process.env.OLLAMA_API_URL || 'https://ollama.axecompanion.com/api';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4-turbo-preview';

// Local model selection based on request type
const MODEL_FOR_CHAT = 'qwen3:4b'; // Fast, good for general chat
const MODEL_FOR_INTEL = 'deepseek-r1:8b'; // Better reasoning for correlations

// Timeouts
const OLLAMA_TIMEOUT_MS = 8000;
const OPENAI_TIMEOUT_MS = 15000;

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

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(`${OLLAMA_API_URL}/generate`, {
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

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.max_tokens ?? 2048,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const latency_ms = Date.now() - startTime;

    const content = data.choices?.[0]?.message?.content || '';
    console.log(`[LLM] OpenAI (${OPENAI_MODEL}) responded in ${latency_ms}ms`);

    return {
      content,
      model: OPENAI_MODEL,
      provider: 'openai',
      latency_ms,
    };
  } catch (error) {
    const latency_ms = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    console.error(`[LLM] OpenAI failed after ${latency_ms}ms: ${errorMessage}`);
    
    throw new Error(`OpenAI error: ${errorMessage}`);
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
function formatMessagesForOllama(messages: Array<{ role: string; content: string }>): string {
  return messages
    .map(msg => {
      const prefix = msg.role === 'user' ? 'User: ' : 'Assistant: ';
      return prefix + msg.content;
    })
    .join('\n\n') + '\n\nAssistant: ';
}

/**
 * Main LLM call with routing and fallback logic
 */
export async function callLLM(
  request: LLMRequest,
  requestType: 'chat' | 'intel' = 'chat'
): Promise<LLMResponse> {
  const model = selectModel(requestType);
  
  console.log(`[LLM] Request type: ${requestType}, target: ${LLM_TARGET}, model: ${model}`);

  if (LLM_TARGET === 'openai') {
    return callOpenAI(request);
  }

  if (LLM_TARGET === 'ollama') {
    return callOllama(request, { model });
  }

  // 'auto' mode: try Ollama first, fallback to OpenAI
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
 * Stream response from LLM (future enhancement)
 */
export async function* streamLLM(
  request: LLMRequest,
  requestType: 'chat' | 'intel' = 'chat'
) {
  const model = selectModel(requestType);
  
  if (LLM_TARGET === 'openai') {
    yield* streamOpenAI(request);
  } else {
    yield* streamOllama(request, { model });
  }
}

async function* streamOllama(
  request: LLMRequest,
  options: CallOllamaOptions = {}
) {
  const model = options.model || MODEL_FOR_CHAT;

  try {
    const response = await fetch(`${OLLAMA_API_URL}/generate`, {
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

async function* streamOpenAI(request: LLMRequest) {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.max_tokens ?? 2048,
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value);
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        if (line === 'data: [DONE]') break;

        try {
          const data = JSON.parse(line.slice(6)) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const content = data.choices?.[0]?.delta?.content;
          if (content) {
            yield content;
          }
        } catch {
          // Parse error, skip
        }
      }
    }
  } catch (error) {
    console.error('[LLM] OpenAI streaming failed:', error);
    throw error;
  }
}

// Export types
export type { LLMRequest, LLMResponse, LLMTarget };
