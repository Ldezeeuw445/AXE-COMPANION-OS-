import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
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

/* ── Memory types ────────────────────────────────────────────────── */

type MemoryType =
  | "observation"       // "Trades better in London session"
  | "pattern"           // "Closes winners too early 3x this week"
  | "preference"        // "Prefers gold, usually bullish bias"
  | "weakness"          // "Adds to losers under pressure"
  | "strength"          // "Excellent risk management in ranging markets"
  | "rule"              // "Never trade NFP without plan"
  | "context";          // "Currently focused on XAUUSD M15 ICT setups"

type ExtractedMemory = {
  memory_type: MemoryType;
  content: string;
  symbol: string | null;
  confidence: number;
};

/* ── GET: list memories ──────────────────────────────────────────── */

export async function GET(req: Request) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return jsonResponse({ ok: false, error: "supabase_not_configured" }, 503);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonResponse({ ok: false, error: "unauthorized" }, 401);

  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 30)));

  let query = supabase
    .from("axe_memory")
    .select("id,memory_type,content,symbol,confidence,source,created_at,updated_at")
    .eq("user_id", user.id)
    .is("resolved_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (type) query = query.eq("memory_type", type);

  const { data, error } = await query;
  if (error) return jsonResponse({ ok: false, error: error.message }, 500);

  return jsonResponse({ ok: true, memories: data ?? [] });
}

/* ── DELETE: remove memory ───────────────────────────────────────── */

export async function DELETE(req: Request) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return jsonResponse({ ok: false, error: "supabase_not_configured" }, 503);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonResponse({ ok: false, error: "unauthorized" }, 401);

  const body = (await req.json().catch(() => null)) as { id?: string } | null;
  if (!body?.id) return jsonResponse({ ok: false, error: "missing id" }, 400);

  const { error } = await supabase
    .from("axe_memory")
    .update({ resolved_at: new Date().toISOString() })
    .eq("id", body.id)
    .eq("user_id", user.id);

  if (error) return jsonResponse({ ok: false, error: error.message }, 500);
  return jsonResponse({ ok: true });
}

/* ── POST: extract memories from conversation ────────────────────── */

export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return jsonResponse({ ok: false, error: "supabase_not_configured" }, 503);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonResponse({ ok: false, error: "unauthorized" }, 401);

  const body = (await req.json().catch(() => null)) as {
    messages?: { role: string; content: string }[];
  } | null;

  const messages = body?.messages ?? [];
  if (messages.length < 2) return jsonResponse({ ok: true, extracted: 0, reason: "too_short" });

  const openaiKey = process.env.OPENAI_API_KEY ?? process.env.OPEN_AI_API_KEY;
  if (!openaiKey) return jsonResponse({ ok: false, error: "OPENAI_API_KEY not configured" }, 503);

  // Load existing memories to avoid duplicates
  const { data: existing } = await supabase
    .from("axe_memory")
    .select("content,memory_type")
    .eq("user_id", user.id)
    .is("resolved_at", null)
    .order("created_at", { ascending: false })
    .limit(30);

  try {
    const extracted = await extractMemories(openaiKey, messages, existing ?? []);

    if (extracted.length === 0) return jsonResponse({ ok: true, extracted: 0 });

    // Store new memories
    let stored = 0;
    for (const mem of extracted) {
      const { error } = await supabase.from("axe_memory").insert({
        user_id: user.id,
        memory_type: mem.memory_type,
        content: mem.content,
        symbol: mem.symbol,
        confidence: mem.confidence,
        source: "chat",
        type: mem.memory_type, // legacy column
      });
      if (!error) stored++;
    }

    return jsonResponse({ ok: true, extracted: stored, memories: extracted });
  } catch (e) {
    return jsonResponse(
      { ok: false, error: e instanceof Error ? e.message : "Extraction failed" },
      500,
    );
  }
}

/* ── GPT-4o memory extraction ────────────────────────────────────── */

async function extractMemories(
  apiKey: string,
  messages: { role: string; content: string }[],
  existing: { content: string; memory_type: string }[],
): Promise<ExtractedMemory[]> {
  const conversationText = messages
    .slice(-20) // Last 20 messages max
    .map((m) => `${m.role.toUpperCase()}: ${m.content.slice(0, 500)}`)
    .join("\n");

  const existingText = existing.length > 0
    ? `\n\nEXISTING MEMORIES (do not duplicate these):\n${existing.map((e) => `- [${e.memory_type}] ${e.content}`).join("\n")}`
    : "";

  const systemPrompt = `You are AXE MEMORY EXTRACTOR. You analyze conversations between a trader and AXE (their AI trading companion) to extract durable observations about the trader.

You extract ONLY insights that would be valuable for AXE to remember across future sessions. Not temporary things like "currently looking at XAUUSD" but durable patterns like "tends to close winners too early" or "prefers London session for gold entries".

Memory types:
- observation: Factual notes about the trader ("Trades XAUUSD and EURUSD primarily")
- pattern: Recurring behavior patterns ("Adds to losing positions when frustrated", "Best win rate on Monday-Wednesday")
- preference: Stated or inferred preferences ("Prefers M15 for entries", "Likes ICT concepts")
- weakness: Trading weaknesses to watch for ("Breaks risk rules after a loss streak", "Revenge trades after SL hit")
- strength: Things the trader does well ("Excellent patience on entry confirmation", "Good at identifying order blocks")
- rule: Trading rules the trader has stated ("Never risk more than 1%", "No trades 30min before NFP")
- context: Longer-term context ("Building a swing portfolio in gold", "Transitioning from demo to live")

Respond in EXACTLY this JSON (no markdown fences):
{
  "memories": [
    {
      "memory_type": "pattern",
      "content": "Closes winning trades at 1R instead of letting runners hit 2R+ — mentioned this as a weakness",
      "symbol": "XAUUSD" or null,
      "confidence": 0.85
    }
  ]
}

RULES:
- Extract 0-4 memories per conversation. Most conversations yield 0-2. Quality over quantity.
- Skip if the conversation is just a quick question/answer with no behavioral insight.
- confidence: 0.5-1.0. Higher = more certain this is a real pattern, not a one-off comment.
- Do NOT extract: temporary price levels, current positions, time-of-day things, what they just asked.
- DO extract: behavioral patterns, emotional tendencies, rule statements, skill assessments, trading style.
- If something contradicts an existing memory, extract the update with confidence 0.9+.
- Return empty array if nothing worth remembering.`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `${conversationText}${existingText}` },
      ],
      temperature: 0.3,
      max_tokens: 1000,
    }),
  });

  if (!res.ok) throw new Error(`OpenAI ${res.status}`);

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content?.trim();
  if (!content) return [];

  const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const parsed = JSON.parse(cleaned) as { memories: ExtractedMemory[] };

  return (parsed.memories ?? [])
    .filter((m) => m.content && m.memory_type)
    .map((m) => ({
      memory_type: m.memory_type,
      content: String(m.content).slice(0, 500),
      symbol: m.symbol || null,
      confidence: Math.max(0.5, Math.min(1, Number(m.confidence) || 0.7)),
    }));
}
