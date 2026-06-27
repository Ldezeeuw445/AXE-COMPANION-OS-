/**
 * POST /api/intel-chat
 *
 * Intel + correlation AI chat. Uses Supabase auth, loads user knowledge layer,
 * and streams SSE tokens so IntelAiChat.tsx can display real-time output.
 *
 * Request body:
 *   { message: string; history?: {role, content}[]; symbol?: string }
 *
 * Response: SSE stream of  data: {"text":"..."}  lines, terminated by data: [DONE]
 */

import { NextRequest } from "next/server";
import { getAuthedServiceSupabase } from "@/services/serviceSupabase";
import { buildIntelKnowledgeLayerBlock } from "@/lib/intel/intelKnowledgeLayer";
import { loadIntelSnapshot } from "@/lib/intel/intelClient";
import { buildIntelContext } from "@/lib/intel/buildIntelContext";
import { streamLLM } from "@/services/llmClient";
import type { LLMRequest } from "@/services/llmClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Patterns that indicate an intel/analysis request → use higher reasoning model
const INTEL_PATTERNS = [
  /correlat/i, /analysis/i, /insight/i, /pattern/i, /strategy/i,
  /edge/i, /opportunity/i, /risk/i, /relationship/i, /cross.market/i,
  /macro/i, /fundamental/i, /technical/i, /why\s+(did|does|is)/i,
  /explain/i, /what.*\b(means?|indicates?|suggests?)\b/i,
  /dark.pool/i, /insider/i, /congress/i, /option/i, /tide/i,
];

function detectRequestType(message: string): "chat" | "intel" {
  for (const p of INTEL_PATTERNS) {
    if (p.test(message)) return "intel";
  }
  return "chat";
}

export async function POST(request: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────
  const auth = await getAuthedServiceSupabase();
  if (!auth) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }
  const { supabase, user } = auth;

  // ── Parse body ────────────────────────────────────────────────────
  let body: { message?: unknown; history?: unknown; symbol?: unknown };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return new Response(JSON.stringify({ error: "message is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const symbol = typeof body.symbol === "string" ? body.symbol : undefined;
  const rawHistory = Array.isArray(body.history) ? body.history : [];
  const history: { role: "user" | "assistant"; content: string }[] = rawHistory
    .filter(
      (m): m is { role: "user" | "assistant"; content: string } =>
        typeof m === "object" &&
        m !== null &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string"
    )
    .slice(-12); // last 12 turns

  // ── Load user knowledge layer (playbooks, rules, memory, trades) ──
  const [knowledgeLayer, intelSnapshot] = await Promise.all([
    buildIntelKnowledgeLayerBlock(supabase, user.id, message, symbol ?? null).catch(() => null),
    loadIntelSnapshot({ symbol: symbol ?? undefined }).catch(() => null),
  ]);

  // ── Build system prompt ───────────────────────────────────────────
  const requestType = detectRequestType(message);

  let systemPrompt = `You are AXE — a battle-hardened trading intelligence engine. You think like a senior prop trader.
You do not teach basics. You do not hedge your words. You analyse, challenge, and sharpen.
You have a Bobby Axelrod-style edge but a warm, direct tone.

Current user id: ${user.id}
${symbol ? `Active symbol / context: ${symbol}` : ""}

Your role here is INTEL ANALYSIS — correlations, smart money flow, macro connections, cross-market reads.
Be concrete. Use numbers. Connect the dots others miss.`;

  if (knowledgeLayer) {
    systemPrompt += `\n\n--- INTEL CONTEXT (RAG + memory + saved correlations) ---\n${knowledgeLayer}`;
  }
  if (intelSnapshot) {
    const live = buildIntelContext(intelSnapshot, symbol);
    if (live.trim()) {
      systemPrompt += `\n\n--- LIVE INTEL SNAPSHOT ---\n${live}`;
    }
  }

  // ── Build messages ────────────────────────────────────────────────
  const llmRequest: LLMRequest = {
    messages: [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: message },
    ],
    temperature: requestType === "intel" ? 0.45 : 0.7,
    max_tokens: requestType === "intel" ? 1200 : 600,
  };

  // ── Stream SSE back to client ─────────────────────────────────────
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();

  (async () => {
    try {
      await streamLLM(llmRequest, (chunk: string) => {
        // Each chunk → SSE event that IntelAiChat expects
        const event = JSON.stringify({ text: chunk });
        writer.write(encoder.encode(`data: ${event}\n`)).catch(() => {});
      });
      await writer.write(encoder.encode("data: [DONE]\n"));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      await writer
        .write(encoder.encode(`data: ${JSON.stringify({ error: msg })}\n`))
        .catch(() => {});
    } finally {
      writer.close().catch(() => {});
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

/** GET — health check */
export async function GET() {
  return new Response(
    JSON.stringify({
      service: "intel-chat",
      status: "operational",
      auth: "supabase",
      streaming: true,
      providers: ["ollama", "openai"],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
