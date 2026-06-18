import type { SupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import {
  summarizeLearningSignals,
  type LearningSignalSummary,
} from "@/services/learningService";
import type {
  CockpitBehaviorMap,
  CockpitConfidencePoint,
  CockpitFeedbackImpact,
} from "@/types/cockpit";

type TradeRow = {
  symbol: string;
  side: string;
  pnl: number | null;
  close_time: string | null;
  open_time: string | null;
};

type TradeLabelRow = {
  trade_id: string;
  axe_label: string | null;
  alignment_score: number | null;
  axe_note: string | null;
  created_at: string;
  updated_at?: string | null;
};

type MessageRow = {
  role: string;
  content: string;
  created_at: string;
};

export type CockpitSourceData = {
  messages: MessageRow[];
  memory: Array<{ scope: string; entry_key: string; content: string; created_at: string }>;
  alerts: Array<{ title: string; type: string; created_at: string }>;
  executions: Array<{ symbol: string; direction: string; status: string; created_at: string }>;
  journals: Array<{ symbol: string | null; notes: string; rating: number | null; tags: string[] | null; created_at: string }>;
  trades: TradeRow[];
  tradeLabels: TradeLabelRow[];
  learningSignalCount: number;
  signalCount: number;
};

export type CockpitSnapshotPayload = {
  alignment_score: number;
  learning_progress: Record<string, unknown>;
  confidence_trend: CockpitConfidencePoint[];
  behavior_map: CockpitBehaviorMap;
  feedback_loop_stats: CockpitFeedbackImpact;
  signal_count: number;
};

const SESSION_BUCKETS = [
  { id: "london", label: "London", start: 2, end: 10 },
  { id: "ny", label: "New York", start: 13, end: 21 },
  { id: "asia", label: "Asia", start: 21, end: 26 },
] as const;

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function sessionLabelForUtcHour(hour: number): (typeof SESSION_BUCKETS)[number]["label"] {
  if (hour >= 2 && hour < 10) return "London";
  if (hour >= 13 && hour < 21) return "New York";
  return "Asia";
}

export async function fetchCockpitSourceData(
  supabase: SupabaseClient,
  userId: string,
): Promise<CockpitSourceData> {
  const [
    messagesResult,
    memoryResult,
    alertsResult,
    execResult,
    journalResult,
    tradesResult,
    tradeLabelsResult,
    learningSignalsResult,
  ] = await Promise.all([
    supabase
      .from("messages")
      .select("role,content,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(120),
    supabase
      .from("assistant_memory_entries")
      .select("scope,entry_key,content,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("alerts")
      .select("title,type,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("execution_requests")
      .select("symbol,direction,status,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("user_journal_entries")
      .select("symbol,notes,rating,tags,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("broker_trades")
      .select("symbol,side,pnl,close_time,open_time")
      .eq("user_id", userId)
      .not("close_time", "is", null)
      .order("close_time", { ascending: false })
      .limit(80),
    supabase
      .from("trade_journal_labels")
      .select("trade_id,axe_label,alignment_score,axe_note,created_at,updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(80),
    supabase
      .from("assistant_learning_signals")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
  ]);

  const messages = ((messagesResult.data ?? []) as MessageRow[]).reverse();
  const memory = memoryResult.data ?? [];
  const alerts = alertsResult.data ?? [];
  const executions = execResult.data ?? [];
  const journals = journalResult.data ?? [];
  const trades = (tradesResult.data ?? []) as TradeRow[];
  const tradeLabels = (tradeLabelsResult.data ?? []) as TradeLabelRow[];
  const learningSignalCount = learningSignalsResult.count ?? 0;

  const signalCount =
    messages.length +
    memory.length +
    alerts.length +
    executions.length +
    journals.length +
    trades.length +
    tradeLabels.length +
    learningSignalCount;

  return {
    messages,
    memory,
    alerts,
    executions,
    journals,
    trades,
    tradeLabels,
    learningSignalCount,
    signalCount,
  };
}

export function canGenerateCockpitSnapshot(data: CockpitSourceData): { ok: true } | { ok: false; reason: string } {
  const hasChat = data.messages.length >= 1;
  const hasTrades = data.trades.length >= 1;
  const hasTradeLabels = data.tradeLabels.length >= 1;
  const hasJournal = data.journals.length >= 1;
  const hasMemory = data.memory.length >= 1;

  if (!hasChat && !hasTrades && !hasTradeLabels && !hasJournal && !hasMemory) {
    return {
      ok: false,
      reason:
        "Not enough real signals yet. Chat with AXE, close a trade, or add a journal note — then AXE can build your cockpit.",
    };
  }

  if (data.signalCount < 2) {
    return {
      ok: false,
      reason: "AXE needs at least two real signals (chat, trades, or journal) before saving a cockpit snapshot.",
    };
  }

  return { ok: true };
}

export function computeHonestAlignmentScore(
  data: CockpitSourceData,
  signalSummary: LearningSignalSummary,
): number {
  const labelScores = data.tradeLabels
    .map((row) => Number(row.alignment_score))
    .filter((score) => Number.isFinite(score) && score >= 0);

  let score01 = 0.22;

  if (labelScores.length > 0) {
    const avg = labelScores.reduce((sum, n) => sum + n, 0) / labelScores.length;
    score01 = avg / 100;
  } else if (signalSummary.total > 0) {
    const alignedRate = signalSummary.aligned / signalSummary.total;
    score01 = 0.18 + alignedRate * 0.55;
  } else if (data.trades.length > 0) {
    const wins = data.trades.filter((t) => (t.pnl ?? 0) > 0).length;
    const winRate = wins / data.trades.length;
    score01 = 0.2 + winRate * 0.35;
  }

  const depthBonus = Math.min(
    0.12,
    labelScores.length * 0.015 +
      data.messages.length * 0.004 +
      data.journals.length * 0.01 +
      data.memory.length * 0.008,
  );

  return clamp01(score01 + depthBonus);
}

function buildBehaviorMap(data: CockpitSourceData): CockpitBehaviorMap {
  const sessionCounts = new Map<string, number>();
  const symbolCounts = new Map<string, number>();
  const tagCounts = new Map<string, number>();

  const stampActivity = (iso: string | null | undefined) => {
    if (!iso) return;
    const hour = new Date(iso).getUTCHours();
    const label = sessionLabelForUtcHour(hour);
    sessionCounts.set(label, (sessionCounts.get(label) ?? 0) + 1);
  };

  for (const trade of data.trades) {
    stampActivity(trade.close_time ?? trade.open_time);
    symbolCounts.set(trade.symbol, (symbolCounts.get(trade.symbol) ?? 0) + 1);
  }
  for (const msg of data.messages) stampActivity(msg.created_at);
  for (const journal of data.journals) {
    stampActivity(journal.created_at);
    if (journal.symbol) symbolCounts.set(journal.symbol, (symbolCounts.get(journal.symbol) ?? 0) + 1);
    for (const tag of journal.tags ?? []) {
      const key = String(tag).trim();
      if (key) tagCounts.set(key, (tagCounts.get(key) ?? 0) + 1);
    }
  }

  const sessionTotal = Array.from(sessionCounts.values()).reduce((a, b) => a + b, 0) || 1;
  const symbolTotal = Array.from(symbolCounts.values()).reduce((a, b) => a + b, 0) || 1;

  const sessions = SESSION_BUCKETS.map((bucket) => ({
    id: bucket.id,
    label: bucket.label,
    weight: clamp01((sessionCounts.get(bucket.label) ?? 0) / sessionTotal),
    note:
      (sessionCounts.get(bucket.label) ?? 0) > 0
        ? `${sessionCounts.get(bucket.label)} recorded sessions in this window (UTC).`
        : undefined,
  })).filter((s) => s.weight > 0);

  const preferredAssets = Array.from(symbolCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([symbol, count]) => ({
      symbol,
      weight: clamp01(count / symbolTotal),
      context: `${count} closed trade${count === 1 ? "" : "s"} or journal mention${count === 1 ? "" : "s"} in recent history.`,
    }));

  const patternTendencies = Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([label, count], idx) => ({
      id: `tag-${idx}`,
      label,
      strength: Math.min(100, 30 + count * 12),
    }));

  if (patternTendencies.length === 0 && data.tradeLabels.length > 0) {
    const labelFreq = new Map<string, number>();
    for (const row of data.tradeLabels) {
      const key = String(row.axe_label ?? "").trim();
      if (!key) continue;
      labelFreq.set(key, (labelFreq.get(key) ?? 0) + 1);
    }
    for (const [label, count] of Array.from(labelFreq.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4)) {
      patternTendencies.push({
        id: `axe-${label}`,
        label: `AXE: ${label}`,
        strength: Math.min(100, 35 + count * 15),
      });
    }
  }

  return { sessions, preferredAssets, patternTendencies };
}

function buildConfidenceTrend(data: CockpitSourceData): CockpitConfidencePoint[] {
  const points: CockpitConfidencePoint[] = [];

  const datedLabels = data.tradeLabels
    .filter((row) => row.alignment_score != null && Number.isFinite(Number(row.alignment_score)))
    .map((row) => ({
      at: row.updated_at ?? row.created_at,
      value: clamp01(Number(row.alignment_score) / 100),
    }))
    .sort((a, b) => a.at.localeCompare(b.at));

  if (datedLabels.length > 0) {
    return datedLabels.slice(-28);
  }

  let running = 0.35;
  for (const msg of data.messages.slice(-20)) {
    if (msg.role !== "assistant") continue;
    running = clamp01(running + 0.02);
    points.push({ at: msg.created_at, value: running });
  }

  return points.slice(-20);
}

function buildFeedbackStats(
  signalSummary: LearningSignalSummary,
  data: CockpitSourceData,
): CockpitFeedbackImpact {
  const weeks = new Map<string, number>();
  const now = Date.now();
  for (let w = 3; w >= 0; w--) {
    const start = new Date(now - (w + 1) * 7 * 24 * 60 * 60 * 1000);
    const end = new Date(now - w * 7 * 24 * 60 * 60 * 1000);
    const label = `${start.toLocaleDateString("en-GB", { month: "short", day: "numeric" })}`;
    weeks.set(label, 0);
    for (const row of data.tradeLabels) {
      const at = new Date(row.updated_at ?? row.created_at).getTime();
      if (at >= start.getTime() && at < end.getTime()) weeks.set(label, (weeks.get(label) ?? 0) + 1);
    }
  }

  const lift =
    signalSummary.total > 0
      ? Math.min(10, Math.round((signalSummary.aligned / signalSummary.total) * 8))
      : 0;

  return {
    acceptedSetups: signalSummary.aligned,
    rejectedSetups: signalSummary.misaligned,
    correctionsCount: signalSummary.corrections,
    correctionLiftPercent: lift,
    last28dTrend: Array.from(weeks.entries()).map(([weekLabel, corrections]) => ({
      weekLabel,
      corrections,
    })),
  };
}

function buildLearningProgress(
  data: CockpitSourceData,
  alignmentScore: number,
  signalSummary: LearningSignalSummary,
): Record<string, unknown> {
  const scorePct = Math.round(alignmentScore * 100);
  const journaledTrades = data.tradeLabels.length;
  const milestones = [
    {
      id: "trade-memory",
      label: "Trade memory",
      periodLabel: journaledTrades >= 8 ? "Strong" : journaledTrades >= 3 ? "Calibrating" : "Early",
      progress: Math.min(100, journaledTrades * 12),
      narrative:
        journaledTrades > 0
          ? `${journaledTrades} closed trade${journaledTrades === 1 ? "" : "s"} scored by AXE auto-journal.`
          : "Close trades and let AXE auto-journal to ground alignment in real outcomes.",
    },
    {
      id: "feedback-loop",
      label: "Feedback loop",
      periodLabel: signalSummary.total >= 6 ? "Strong" : signalSummary.total >= 2 ? "Calibrating" : "Early",
      progress: Math.min(100, signalSummary.total * 14),
      narrative:
        signalSummary.total > 0
          ? `${signalSummary.aligned} aligned vs ${signalSummary.misaligned} misaligned signals recorded.`
          : "Manual journal tags and AXE trade reviews sharpen this score.",
    },
    {
      id: "chat-context",
      label: "Chat context",
      periodLabel: data.messages.length >= 20 ? "Strong" : data.messages.length >= 5 ? "Calibrating" : "Early",
      progress: Math.min(100, data.messages.length * 4),
      narrative: `${data.messages.length} chat messages inform pacing, doubt, and coaching tone.`,
    },
  ];

  const headline =
    journaledTrades > 0
      ? `AXE alignment is ${scorePct}% based on ${journaledTrades} journaled trade${journaledTrades === 1 ? "" : "s"}, ${data.messages.length} chat messages, and ${signalSummary.total} feedback signals — not a generic guess.`
      : `Early cockpit at ${scorePct}% from ${data.signalCount} workspace signals. Close trades or journal with AXE to make this fully trade-grounded.`;

  return { headline, milestones };
}

async function maybeEnrichNarrativeWithGpt(
  data: CockpitSourceData,
  learningProgress: Record<string, unknown>,
  alignmentScore: number,
  apiKey: string | undefined,
): Promise<Record<string, unknown>> {
  if (!apiKey || data.messages.length < 4) return learningProgress;

  try {
    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.25,
      max_tokens: 500,
      messages: [
        {
          role: "system",
          content:
            "Rewrite only the learning_progress.headline and milestone narratives for a trader cockpit. Keep all numbers and facts exactly as given. Return JSON: { \"headline\": string, \"milestones\": [{\"id\",\"label\",\"periodLabel\",\"progress\",\"narrative\"}] }",
        },
        {
          role: "user",
          content: JSON.stringify({
            alignmentPercent: Math.round(alignmentScore * 100),
            learning_progress: learningProgress,
            topSymbols: data.trades.slice(0, 5).map((t) => t.symbol),
            recentChatTopics: data.messages.slice(-8).map((m) => m.content.slice(0, 120)),
          }),
        },
      ],
    });
    const raw = completion.choices[0]?.message?.content ?? "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return learningProgress;
    const parsed = JSON.parse(match[0]) as { headline?: string; milestones?: unknown[] };
    if (!parsed.headline) return learningProgress;
    return {
      ...learningProgress,
      headline: parsed.headline,
      milestones: Array.isArray(parsed.milestones) ? parsed.milestones : learningProgress.milestones,
    };
  } catch {
    return learningProgress;
  }
}

export async function upsertCockpitLearningMetrics(
  supabase: SupabaseClient,
  userId: string,
  snapshot: CockpitSnapshotPayload,
  tradeLabelCount: number,
): Promise<void> {
  const now = new Date().toISOString();
  const periodStart = new Date();
  periodStart.setUTCHours(0, 0, 0, 0);

  const rows = [
    {
      metric_key: "alignment_score",
      metric_value: Math.round(snapshot.alignment_score * 100),
      dimensions: { label: "Alignment", trend: "flat" },
    },
    {
      metric_key: "journaled_trades",
      metric_value: tradeLabelCount,
      dimensions: { label: "Journaled trades", trend: "up" },
    },
    {
      metric_key: "signal_depth",
      metric_value: snapshot.signal_count,
      dimensions: { label: "Signal depth", trend: "up" },
    },
  ];

  for (const row of rows) {
    const { data: existing } = await supabase
      .from("assistant_learning_metrics")
      .select("id")
      .eq("user_id", userId)
      .eq("metric_key", row.metric_key)
      .maybeSingle();

    const payload = {
      user_id: userId,
      metric_key: row.metric_key,
      metric_value: row.metric_value,
      dimensions: row.dimensions,
      period_start: periodStart.toISOString(),
      updated_at: now,
    };

    if (existing?.id) {
      await supabase.from("assistant_learning_metrics").update(payload).eq("id", existing.id);
    } else {
      await supabase.from("assistant_learning_metrics").insert(payload);
    }
  }
}

export async function generateCockpitSnapshot(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ ok: true; snapshotId: string } | { ok: false; error: string; status: number }> {
  const data = await fetchCockpitSourceData(supabase, userId);
  const gate = canGenerateCockpitSnapshot(data);
  if (!gate.ok) return { ok: false, error: gate.reason, status: 422 };

  const signalSummary = await summarizeLearningSignals(supabase, userId);
  const alignmentScore = computeHonestAlignmentScore(data, signalSummary);

  const snapshot: CockpitSnapshotPayload = {
    alignment_score: alignmentScore,
    learning_progress: buildLearningProgress(data, alignmentScore, signalSummary),
    confidence_trend: buildConfidenceTrend(data),
    behavior_map: buildBehaviorMap(data),
    feedback_loop_stats: buildFeedbackStats(signalSummary, data),
    signal_count: data.signalCount,
  };

  const apiKey = process.env.OPENAI_API_KEY ?? process.env.OPEN_AI_API_KEY;
  const enriched = await maybeEnrichNarrativeWithGpt(
    data,
    snapshot.learning_progress,
    alignmentScore,
    apiKey,
  );
  snapshot.learning_progress = enriched;

  const { data: saved, error: saveErr } = await supabase
    .from("assistant_cockpit_snapshots")
    .insert({
      user_id: userId,
      alignment_score: snapshot.alignment_score,
      learning_progress: snapshot.learning_progress ?? {},
      confidence_trend: snapshot.confidence_trend ?? [],
      behavior_map: snapshot.behavior_map ?? { sessions: [], preferredAssets: [], patternTendencies: [] },
      feedback_loop_stats: snapshot.feedback_loop_stats ?? {},
      signal_count: snapshot.signal_count,
      captured_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (saveErr) {
    console.error("[cockpitSnapshot] save error:", saveErr.message, saveErr.details);
    return {
      ok: false,
      error:
        saveErr.message.includes("assistant_cockpit_snapshots")
          ? "Cockpit tables missing — run Supabase migrations, then retry."
          : `Failed to save snapshot: ${saveErr.message}`,
      status: 500,
    };
  }

  await upsertCockpitLearningMetrics(supabase, userId, snapshot, data.tradeLabels.length);

  return { ok: true, snapshotId: saved.id as string };
}

/** Fire-and-forget refresh after auto-journal or trade close — never throws. */
export function scheduleCockpitRefresh(supabase: SupabaseClient, userId: string): void {
  void generateCockpitSnapshot(supabase, userId)
    .then((result) => {
      if (!result.ok) {
        console.warn("[cockpitSnapshot] background refresh skipped:", result.error);
      }
    })
    .catch((err) => {
      console.error("[cockpitSnapshot] background refresh failed:", err);
    });
}
