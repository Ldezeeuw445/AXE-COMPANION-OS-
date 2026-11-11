import { createEdgeSupabaseClient } from "@/lib/supabase/edge";
import { callLLM } from "@/services/llmClient";
import { requireEntitlementFeature } from "@/lib/billing/requireFeature";
import {
  isMemoryType,
  parseExtractedMemories,
  parseMemoryLimit,
  selectMemoriesToStore,
  trimConversation,
} from "@/lib/axe/memoryRules";

export const dynamic = "force-dynamic";

/**
 * POST /api/axe-memory — Extract and store observations from a conversation.
 *   Body: { messages: [{role, content}] }
 *   Called after meaningful chat interactions to build AXE's long-term memory.
 *
 * GET /api/axe-memory — List memories for the current user.
 *   Query: ?type=observation|pattern|preference|weakness|strength&limit=20
 *
 * DELETE /api/axe-memory — Remove a memory by id.
 *   Body: { id: string }
 */

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/* ── GET: list memories ──────────────────────────────────────────── */

export async function GET(request: Request) {
  const supabase = createEdgeSupabaseClient(request);
  if (!supabase) return jsonResponse({ ok: false, error: "supabase_not_configured" }, 503);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  const gate = await requireEntitlementFeature(supabase, user.id, "advanced_memory");
  if (!gate.ok) {
    return jsonResponse({ ok: false, error: gate.error, upgradeRequired: true }, gate.status);
  }

  const url = new URL(request.url);
  const rawType = url.searchParams.get("type");
  if (rawType && !isMemoryType(rawType)) {
    return jsonResponse({ ok: false, error: "Unknown memory type." }, 400);
  }
  const type = rawType;
  const limit = parseMemoryLimit(url.searchParams.get("limit"));

  let query = supabase
    .from("axe_memories")
    .select("id,memory_type,content,symbol,confidence,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (type) {
    query = query.eq("memory_type", type);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[axe-memory] GET failed:", error);
    return jsonResponse({ ok: false, error: "Failed to load memories." }, 500);
  }

  return jsonResponse({ ok: true, memories: data ?? [] });
}

/* ── POST: extract & store memories ──────────────────────────────── */

export async function POST(request: Request) {
  const supabase = createEdgeSupabaseClient(request);
  if (!supabase) return jsonResponse({ ok: false, error: "supabase_not_configured" }, 503);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  const gate = await requireEntitlementFeature(supabase, user.id, "advanced_memory");
  if (!gate.ok) {
    return jsonResponse({ ok: false, error: gate.error, upgradeRequired: true }, gate.status);
  }

  const body = (await request.json().catch(() => ({}))) as { messages?: unknown };

  // Last 20 well-formed messages, each capped in length.
  const recentMessages = trimConversation(body.messages);
  if (recentMessages.length < 2) {
    return jsonResponse({ ok: false, error: "Need at least 2 messages to extract memories." }, 400);
  }

  try {
    const memories = await extractMemories(recentMessages);

    if (memories.length === 0) {
      return jsonResponse({ ok: true, extracted: 0, stored: 0 });
    }

    // Skip repeats of memories the trader already has.
    const { data: existing, error: existingError } = await supabase
      .from("axe_memories")
      .select("memory_type,content")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(500);
    if (existingError) {
      console.error("[axe-memory] Failed to load existing memories:", existingError);
      return jsonResponse({ ok: false, error: "Failed to load memories." }, 500);
    }

    const toStore = selectMemoriesToStore(memories, existing ?? []);
    if (toStore.length === 0) {
      return jsonResponse({ ok: true, extracted: memories.length, stored: 0 });
    }

    const { data: stored, error } = await supabase
      .from("axe_memories")
      .insert(
        toStore.map((memory) => ({
          user_id: user.id,
          memory_type: memory.memory_type,
          content: memory.content,
          symbol: memory.symbol,
          confidence: memory.confidence,
        })),
      )
      .select("id");

    if (error) {
      console.error("[axe-memory] Failed to store memories:", error);
      return jsonResponse({ ok: false, error: "Failed to store memories." }, 500);
    }

    return jsonResponse({ ok: true, extracted: memories.length, stored: stored?.length ?? 0 });
  } catch (e) {
    console.error("[axe-memory] Extraction failed:", e);
    return jsonResponse({ ok: false, error: "Failed to extract memories." }, 500);
  }
}

/* ── DELETE: remove a memory ───────────────────────────────────── */

export async function DELETE(request: Request) {
  const supabase = createEdgeSupabaseClient(request);
  if (!supabase) return jsonResponse({ ok: false, error: "supabase_not_configured" }, 503);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  const gate = await requireEntitlementFeature(supabase, user.id, "advanced_memory");
  if (!gate.ok) {
    return jsonResponse({ ok: false, error: gate.error, upgradeRequired: true }, gate.status);
  }

  const body = (await request.json().catch(() => ({}))) as { id?: string };
  const id = body.id;

  if (!id) {
    return jsonResponse({ ok: false, error: "Memory id is required." }, 400);
  }

  const { error } = await supabase
    .from("axe_memories")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error("[axe-memory] DELETE failed:", error);
    return jsonResponse({ ok: false, error: "Failed to delete memory." }, 500);
  }

  return jsonResponse({ ok: true });
}

/* ── LLM Memory Extraction ─────────────────────────────────────── */

const MEMORY_SYSTEM_PROMPT = `You are AXE Memory Extractor — an AI that analyzes trading conversations and extracts durable observations about the trader.

Analyze the conversation and extract 0-5 memories that would help AXE provide better personalized advice in future conversations.

Memory types:
- observation: "Trades better in London session"
- pattern: "Closes winners too early 3x this week"
- preference: "Prefers gold, usually bullish bias"
- weakness: "Adds to losers under pressure"
- strength: "Excellent risk management in ranging markets"
- rule: "Never trade NFP without plan"
- context: "Currently focused on XAUUSD M15 ICT setups"

Respond in EXACTLY this JSON format (no markdown, no code fences):
{
  "memories": [
    {
      "memory_type": "observation",
      "content": "Clear, specific observation",
      "symbol": "XAUUSD" or null,
      "confidence": 0.85
    }
  ]
}

Rules:
- Only extract high-confidence observations (confidence >= 0.6)
- Be specific, not generic
- Include symbol if relevant
- If no meaningful observations, return empty array
- Never fabricate information not in the conversation`;

async function extractMemories(
  messages: Array<{ role: string; content: string }>
): Promise<ReturnType<typeof parseExtractedMemories>> {
  const conversationText = messages
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n\n");

  const llmMessages: Array<{ role: string; content: string }> = [
    { role: "system", content: MEMORY_SYSTEM_PROMPT },
    { role: "user", content: `Analyze this conversation and extract memories:\n\n${conversationText}` },
  ];

  const result = await callLLM({
    messages: llmMessages,
    temperature: 0.3,
    max_tokens: 1500,
  });

  return parseExtractedMemories(result.content);
}
