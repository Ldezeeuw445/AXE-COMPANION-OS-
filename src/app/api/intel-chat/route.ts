/**
 * POST /api/intel-chat
 * 
 * Chat endpoint with LLM routing.
 * Detects message type and routes to appropriate model:
 * - General chat → qwen3:4b (fast)
 * - Intel/correlation questions → deepseek-r1:8b (reasoning)
 * 
 * Request:
 * {
 *   "traderId": "user_123",
 *   "message": "What is my correlation to BTC?",
 *   "context": { "pairs": ["EURUSD", "GBPUSD"], ... }
 * }
 * 
 * Response:
 * {
 *   "content": "Based on your trading...",
 *   "model": "deepseek-r1:8b",
 *   "provider": "ollama",
 *   "latency_ms": 2456
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { callLLM, type LLMRequest, type LLMResponse } from '@/services/llmClient';

// Patterns that indicate an intel/analysis request
const INTEL_PATTERNS = [
  /correlat/i,
  /analysis/i,
  /insight/i,
  /pattern/i,
  /strategy/i,
  /edge/i,
  /advantage/i,
  /opportunity/i,
  /risk/i,
  /relationship/i,
  /connection/i,
  /cross-market/i,
  /macro/i,
  /fundamental/i,
  /technical/i,
  /why\s+(did|does|is)/i,
  /explain/i,
  /what.*\b(means?|indicates?|suggests?)\b/i,
];

interface ChatRequest {
  traderId: string;
  message: string;
  context?: Record<string, unknown>;
  history?: Array<{ role: string; content: string }>;
}

interface ChatResponse {
  content: string;
  model: string;
  provider: 'ollama' | 'openai';
  latency_ms: number;
  requestType: 'chat' | 'intel';
}

/**
 * Detect if a message is asking for intelligence/analysis
 */
function detectRequestType(message: string): 'chat' | 'intel' {
  // Check if any intel pattern matches
  for (const pattern of INTEL_PATTERNS) {
    if (pattern.test(message)) {
      return 'intel';
    }
  }
  return 'chat';
}

/**
 * Build context-aware system prompt for AXE
 */
function buildSystemPrompt(traderId: string, context?: Record<string, unknown>): string {
  let prompt = `You are AXE Companion, a friendly AI trading second brain with a Bobby Axelrod-style edge.
You are speaking to trader ${traderId}.

Personality:
- Warm, intelligent, and respectful of the trader's autonomy
- Occasionally use trading references or light humor
- Cut straight to insights without unnecessary preamble
- Always prioritize the trader's edge and risk management`;

  if (context?.pairs) {
    const pairs = Array.isArray(context.pairs) ? context.pairs.join(', ') : String(context.pairs);
    prompt += `\n\nThis trader focuses on: ${pairs}`;
  }

  if (context?.recentWins) {
    prompt += `\n\nRecent wins: ${context.recentWins}`;
  }

  if (context?.style) {
    prompt += `\n\nTrading style: ${context.style}`;
  }

  return prompt;
}

/**
 * Handle POST /api/intel-chat
 */
export async function POST(request: NextRequest): Promise<NextResponse<ChatResponse | { error: string }>> {
  const startTime = Date.now();

  try {
    // Validate request
    if (request.headers.get('content-type') !== 'application/json') {
      return NextResponse.json(
        { error: 'Content-Type must be application/json' },
        { status: 400 }
      );
    }

    const body = await request.json() as ChatRequest;
    const { traderId, message, context, history } = body;

    if (!traderId || !message) {
      return NextResponse.json(
        { error: 'traderId and message are required' },
        { status: 400 }
      );
    }

    // Determine request type
    const requestType = detectRequestType(message);
    console.log(`[Chat] Request type: ${requestType}, message: ${message.slice(0, 50)}...`);

    // Build messages for LLM
    const systemPrompt = buildSystemPrompt(traderId, context);
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemPrompt },
      ...(history || []),
      { role: 'user', content: message },
    ];

    // Call LLM
    const llmRequest: LLMRequest = {
      messages,
      temperature: requestType === 'intel' ? 0.5 : 0.7, // Lower temp for analysis
      max_tokens: requestType === 'intel' ? 1024 : 512,
    };

    const response = await callLLM(llmRequest, requestType);
    const latency_ms = Date.now() - startTime;

    // Log success
    console.log(`[Chat] ${requestType} completed in ${latency_ms}ms via ${response.provider}`);

    // Return response
    return NextResponse.json<ChatResponse>(
      {
        content: response.content,
        model: response.model,
        provider: response.provider,
        latency_ms,
        requestType,
      },
      { status: 200 }
    );
  } catch (error) {
    const latency_ms = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.error(`[Chat] Error after ${latency_ms}ms: ${errorMessage}`);

    return NextResponse.json(
      {
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}

/**
 * Handle GET /api/intel-chat (health check / info)
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    service: 'intel-chat',
    status: 'operational',
    models: {
      chat: 'qwen3:4b',
      intel: 'deepseek-r1:8b',
    },
    providers: ['ollama', 'openai'],
    target: process.env.LLM_TARGET || 'auto',
  });
}
