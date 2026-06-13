import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { summarizeLearningSignals } from "@/services/learningService";
import OpenAI from "openai";

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
- alignment_score must be conservative and evidence-based: 0-0.25 for sparse/early signals, 0.25-0.55 for useful but incomplete history, 0.55-0.80 for broad repeated evidence, 0.80+ only for rich history with repeated confirmed feedback
- Identify which instruments were discussed most and weight them
- Identify session patterns from timestamps (UTC: 02-10 = London, 13-21 = NY, rest = Asia)
- Count: accepted setups = user agreed with AXE's analysis, rejected = user pushed back or corrected
- patternTendencies: extract recurring trading concepts mentioned (order blocks, FVGs, sweeps, etc.)
- confidence_trend: generate realistic daily points spanning the message history period
- Return ONLY the JSON object, no other text.`;

export async function POST() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const apiKey = process.env.OPENAI_API_KEY ?? process.env.OPEN_AI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OpenAI not configured" }, { status: 500 });
  }

  // Fetch data in parallel
  const [messagesResult, memoryResult, alertsResult, execResult, journalResult, tradesResult, tradeLabelsResult] =
    await Promise.all([
    supabase
      .from("messages")
      .select("role,content,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100),

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

    supabase
      .from("user_journal_entries")
      .select("symbol,notes,rating,tags,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30),

    supabase
      .from("broker_trades")
      .select("symbol,side,pnl,close_time,open_time")
      .eq("user_id", user.id)
      .order("close_time", { ascending: false })
      .limit(50),

    supabase
      .from("trade_journal_labels")
      .select("trade_id,label,axe_label,alignment_score,axe_journal")
      .eq("user_id", user.id)
      .limit(80),
  ]);

  const messages = (messagesResult.data ?? []).reverse();
  const memory = memoryResult.data ?? [];
  const alerts = alertsResult.data ?? [];
  const execs = execResult.data ?? [];
  const journals = journalResult.data ?? [];
  const trades = tradesResult.data ?? [];
  const tradeLabels = tradeLabelsResult.data ?? [];
  const signalCount =
    messages.length + memory.length + alerts.length + execs.length + journals.length + trades.length + tradeLabels.length;

  if (signalCount < 5 || messages.length < 2) {
    return NextResponse.json(
      { error: "Not enough real signals to generate a cockpit snapshot yet. Chat, journal, or trade history will calibrate AXE first." },
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
    recentMessages: messages.slice(-60).map((m) => ({
      role: m.role,
      at: m.created_at,
      content: (m.content as string).slice(0, 300),
    })),
    memory: memory.map((m) => ({ scope: m.scope, key: m.entry_key, value: m.content })),
    alerts: alerts.map((a) => ({ title: a.title, type: a.type, at: a.created_at })),
    executions: execs.map((e) => ({ symbol: e.symbol, direction: e.direction, status: e.status, at: e.created_at })),
    journals: journals.map((j) => ({ symbol: j.symbol, rating: j.rating, tags: j.tags, at: j.created_at, notes: String(j.notes ?? "").slice(0, 260) })),
    trades: trades.map((t) => ({ symbol: t.symbol, side: t.side, pnl: t.pnl, opened: t.open_time, closed: t.close_time })),
    tradeJournalLabels: tradeLabels.map((l) => ({
      tradeId: l.trade_id,
      manualLabel: l.label,
      axeLabel: l.axe_label,
      alignmentScore: l.alignment_score,
      hasAxeBreakdown: Boolean(l.axe_journal),
    })),
  };

  const client = new OpenAI({ apiKey });

  let snapshot: Record<string, unknown>;
  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o",
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

    const raw = completion.choices[0]?.message?.content ?? "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");
    snapshot = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
  } catch (err) {
    console.error("[cockpit/generate] GPT error:", err);
    return NextResponse.json({ error: "Failed to generate snapshot" }, { status: 500 });
  }

  // Ground the feedback figures in recorded behavioral signals (journal labels,
  // per-trade alignment) instead of trusting the model's guess. Falls back to
  // the model output only when there are no recorded signals yet.
  const signalSummary = await summarizeLearningSignals(supabase, user.id);
  if (signalSummary.total > 0) {
    const modelFeedback =
      (snapshot.feedback_loop_stats as Record<string, unknown> | undefined) ?? {};
    snapshot.feedback_loop_stats = {
      ...modelFeedback,
      acceptedSetups: signalSummary.aligned,
      rejectedSetups: signalSummary.misaligned,
      correctionsCount: signalSummary.corrections,
    };
  }

  const alignmentScores = tradeLabels
    .map((l) => (l.alignment_score != null ? Number(l.alignment_score) : null))
    .filter((score): score is number => score != null && Number.isFinite(score));
  if (alignmentScores.length > 0) {
    const avgPct = alignmentScores.reduce((sum, score) => sum + score, 0) / alignmentScores.length;
    snapshot.alignment_score = Math.round((avgPct / 100) * 100) / 100;
  } else if (signalSummary.total > 0) {
    snapshot.alignment_score = Math.round((signalSummary.aligned / signalSummary.total) * 100) / 100;
  }

  // Save to Supabase (include signal_count for staleness tracking)
  const { data: saved, error: saveErr } = await supabase
    .from("assistant_cockpit_snapshots")
    .insert({
      user_id: user.id,
      alignment_score: snapshot.alignment_score,
      learning_progress: snapshot.learning_progress,
      confidence_trend: snapshot.confidence_trend,
      behavior_map: snapshot.behavior_map,
      feedback_loop_stats: snapshot.feedback_loop_stats,
      signal_count: signalCount,
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
