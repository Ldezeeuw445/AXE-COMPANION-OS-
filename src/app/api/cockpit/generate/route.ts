import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { callLLM } from "@/services/llmClient";

const COCKPIT_PROMPT = `You are analyzing a trader's private session history with their AI trading companion (AXE).
Your job is to generate a structured cockpit snapshot that reflects the trader's actual behavior, patterns, and how well the AI has learned their style.

Analyze the provided data and return a JSON object matching this exact schema:

{
  "alignment_score": <number 0-1, how well AXE understands the trader's style>,
  "learning_progress": {
    "headline": "<2-3 sentences describing what AXE learned this period>",
    "milestones": [
      {
        "id": "<string>",
        "label": "<skill or pattern name>",
        "periodLabel": "<Stabilized | Strong | Calibrating | Early>",
        "progress": <0-100>,
        "narrative": "<1 sentence about this milestone>"
      }
    ]
  },
  "confidence_trend": [
    { "at": "<ISO timestamp>", "value": <0-1> }
  ],
  "behavior_map": {
    "sessions": [
      { "id": "<string>", "label": "<London|New York|Asia>", "weight": <0-1>, "note": "<optional 1 sentence>" }
    ],
    "preferredAssets": [
      { "symbol": "<ticker>", "weight": <0-1>, "context": "<1 sentence how trader uses this>" }
    ],
    "patternTendencies": [
      { "id": "<string>", "label": "<pattern name>", "strength": <0-100> }
    ]
  },
  "feedback_loop_stats": {
    "acceptedSetups": <count>,
    "rejectedSetups": <count>,
    "correctionsCount": <count>,
    "correctionLiftPercent": <estimated 0-10>,
    "last28dTrend": [
      { "weekLabel": "<e.g. Apr 1-7>", "corrections": <count> }
    ]
  }
}

Rules:
- Base everything on the actual data provided. Do not invent specifics that aren't supported by the data.
- alignment_score: 0.5-0.65 if few sessions, 0.65-0.80 for moderate history, 0.80+ for rich history
- Identify which instruments were discussed most and weight them
- Identify session patterns from timestamps (UTC: 02-10 = London, 13-21 = NY, rest = Asia)
- Count: accepted setups = user agreed with AXE's analysis, rejected = user pushed back or corrected
- patternTendencies: extract recurring trading concepts mentioned (order blocks, FVGs, sweeps, etc.)
- confidence_trend: generate realistic daily points spanning the message history period
- Return ONLY the JSON object, no other text.`;

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // AI provider check is handled by aiProvider service

  // Allow generating cockpit for a specific assistant type (axe|intel)
  const url = new URL(request.url);
  const type = url.searchParams.get("type") === "intel" ? "intel" : "axe";

  // Find conversations for this user and type
  const { data: convs } = await supabase
    .from("conversations")
    .select("id")
    .eq("user_id", user.id)
    .eq("conversation_type", type)
    .order("last_message_at", { ascending: false })
    .limit(5);

  const convIds: string[] = Array.isArray(convs) ? convs.map((c: any) => c.id) : [];

  // Fetch data in parallel, scoped to the selected conversation type
  const [messagesResult, memoryResult, alertsResult, execResult] = await Promise.all([
    supabase
      .from("messages")
      .select("role,content,created_at,conversation_id")
      .in("conversation_id", convIds.length ? convIds : ["dummy-no-conv"])
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(200),

    supabase
      .from("assistant_memory_entries")
      .select("scope,entry_key,content,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30),

    supabase
      .from("alerts")
      .select("title,body,type,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(40),

    supabase
      .from("execution_requests")
      .select("symbol,direction,status,notes,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  const messages = (messagesResult.data ?? []).reverse();
  const memory = memoryResult.data ?? [];
  const alerts = alertsResult.data ?? [];
  const execs = execResult.data ?? [];

  if (messages.length < 2) {
    return NextResponse.json(
      { error: `Not enough conversation history to generate a snapshot for ${type}. Have a few sessions with the ${type.toUpperCase()} agent first.` },
      { status: 422 }
    );
  }

  // Build analysis payload
  const payload = {
    messageCount: messages.length,
    dateRange: {
      from: messages[0]?.created_at,
      to: messages[messages.length - 1]?.created_at,
    },
    recentMessages: messages.slice(-200).map((m) => ({
      role: m.role,
      at: m.created_at,
      content: (m.content as string).slice(0, 300),
    })),
    memory: memory.map((m) => ({ scope: m.scope, key: m.entry_key, value: m.content })),
    alerts: alerts.map((a) => ({ title: a.title, type: a.type, at: a.created_at })),
    executions: execs.map((e) => ({ symbol: e.symbol, direction: e.direction, status: e.status, at: e.created_at })),
  };

  try {
    const result = await callLLM({
      temperature: 0.3,
      max_tokens: 2000,
      messages: [
        { role: "system", content: COCKPIT_PROMPT },
        {
          role: "user",
          content: `Trader session data:\n${JSON.stringify(payload, null, 2)}`,
        },
      ],
    });

    const raw = result.content ?? "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");
    var snapshot = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
  } catch (err) {
    console.error("[cockpit/generate] AI error:", err);
    return NextResponse.json({ error: "Failed to generate snapshot" }, { status: 500 });
  }

  // Save to Supabase
  const { data: saved, error: saveErr } = await supabase
    .from("assistant_cockpit_snapshots")
    .insert({
      user_id: user.id,
      alignment_score: snapshot.alignment_score,
      learning_progress: snapshot.learning_progress,
      confidence_trend: snapshot.confidence_trend,
      behavior_map: snapshot.behavior_map,
      feedback_loop_stats: snapshot.feedback_loop_stats,
      captured_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (saveErr) {
    console.error("[cockpit/generate] save error:", saveErr.message);
    return NextResponse.json({ error: "Failed to save snapshot" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, snapshotId: saved.id });
}
