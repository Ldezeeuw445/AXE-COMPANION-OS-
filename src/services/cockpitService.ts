import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthedServiceSupabase } from "@/services/serviceSupabase";
import type {
  CockpitDashboard,
  CockpitAlignment,
  CockpitBehaviorMap,
  CockpitFeedbackImpact,
  CockpitConfidencePoint,
  CockpitLearningMilestone,
  CockpitTodaySummary,
  CockpitLearningArc,
} from "@/types/cockpit";
import { getTraderLearningArc, type TraderLearningArc } from "@/services/learningArcService";

function toCockpitLearningArc(arc: TraderLearningArc): CockpitLearningArc {
  const focus = arc.topPairs.slice(0, 5).map((label, i) => ({
    label,
    count: Math.max(1, 5 - i),
  }));
  return {
    headline: arc.topPairs[0]
      ? `Top pair: ${arc.topPairs[0]} · ${arc.topTimeframes[0] ?? ""}`
      : "Keep trading to build your arc",
    weeklyFocus: focus,
    messageFeedback: { up: 0, down: 0 },
    weeklyFeedbackTrend: [],
  };
}
import { computeTraderScores } from "@/services/traderScoresService";

const EMPTY_TRADER_SCORES = {
  periodDays: 90,
  sampleSize: 0,
  tradeCount: 0,
  traderOverallScore: null as number | null,
  scores: [
    { key: "discipline" as const, label: "Discipline", score: 0, available: false, hint: "Awaiting journal data." },
    { key: "execution" as const, label: "Execution", score: 0, available: false, hint: "Awaiting journal data." },
    { key: "risk" as const, label: "Risk", score: 0, available: false, hint: "Awaiting journal data." },
    { key: "patience" as const, label: "Patience", score: 0, available: false, hint: "Awaiting trade history." },
  ],
};

const EMPTY_TODAY: CockpitTodaySummary = {
  chatMessages: 0,
  tradesClosed: 0,
  feedEvents: 0,
  journalNotes: 0,
};

const EMPTY_DASHBOARD: CockpitDashboard = {
  snapshotId: "",
  shouldAutoRefresh: false,
  learningProgress: { headline: "", milestones: [] },
  alignment: { score: 0, capturedAt: new Date().toISOString(), deltaFromPrior: 0 },
  confidence: { headline: "", series: [] },
  feedback: {
    acceptedSetups: 0,
    rejectedSetups: 0,
    correctionsCount: 0,
    correctionLiftPercent: 0,
    last28dTrend: [],
  },
  behavior: { sessions: [], preferredAssets: [], patternTendencies: [] },
  metricKeysSample: [],
  calibration: {
    state: "insufficient_data",
    signalCount: 0,
    missingSignals: ["chat", "journal", "trade history", "memory"],
    lastCalculatedAt: null,
    message: "AXE needs real chat, journal, memory, or trade signals before it can score alignment.",
  },
  today: EMPTY_TODAY,
  learningArc: {
    headline: "",
    weeklyFocus: [],
    messageFeedback: { up: 0, down: 0 },
    weeklyFeedbackTrend: [],
  },
  traderScores: EMPTY_TRADER_SCORES,
};

function safeArray<T>(val: unknown): T[] {
  return Array.isArray(val) ? (val as T[]) : [];
}

function safeNum(val: unknown, fallback = 0): number {
  return typeof val === "number" && isFinite(val) ? val : fallback;
}

function safeStr(val: unknown, fallback = ""): string {
  return typeof val === "string" ? val : fallback;
}

function mapAlignment(
  score: number,
  capturedAt: string,
  prior: number | null
): CockpitAlignment {
  return {
    score: Math.round(score * (score > 1 ? 1 : 100)),
    capturedAt,
    deltaFromPrior: prior !== null ? Math.round((score - prior) * (score > 1 ? 1 : 100)) : 0,
  };
}

function calibrationState(input: {
  signalCount: number;
  hasSnapshot: boolean;
  lastCalculatedAt: string | null;
  messageCount: number;
  memoryCount: number;
  journalCount: number;
  tradeCount: number;
}): CockpitDashboard["calibration"] {
  const missingSignals = [
    input.messageCount > 0 ? null : "chat",
    input.memoryCount > 0 ? null : "memory",
    input.journalCount > 0 ? null : "journal",
    input.tradeCount > 0 ? null : "trade history",
  ].filter((s): s is string => Boolean(s));

  const base = {
    signalCount: input.signalCount,
    missingSignals,
    lastCalculatedAt: input.lastCalculatedAt,
  };
  if (input.signalCount < 2) {
    return {
      ...base,
      state: "insufficient_data",
      message: "Not enough real signals yet. Chat, journal notes, trades, and saved memory will calibrate AXE.",
    };
  }
  if (!input.hasSnapshot || input.signalCount < 5 || missingSignals.length >= 3) {
    return {
      ...base,
      state: "calibrating",
      message: "AXE is calibrating from early real signals. Scores stay conservative until more history exists.",
    };
  }
  return {
    ...base,
    state: "active",
    message: "Alignment is based on current saved context, messages, journal patterns, and account history.",
  };
}

function countOrZero(result: { count: number | null; error?: unknown }): number {
  if (result.error) return 0;
  return result.count ?? 0;
}

function todayUtcStartIso(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function fetchCockpitTodaySummary(
  supabase: SupabaseClient,
  userId: string,
): Promise<CockpitTodaySummary> {
  const since = todayUtcStartIso();
  const [chatRes, tradesRes, feedRes, journalRes] = await Promise.all([
    supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("role", "user")
      .gte("created_at", since),
    supabase
      .from("broker_trades")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .not("close_time", "is", null)
      .gte("close_time", since),
    supabase
      .from("axe_proactive_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", since),
    supabase
      .from("user_journal_entries")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", since),
  ]);

  return {
    chatMessages: countOrZero(chatRes),
    tradesClosed: countOrZero(tradesRes),
    feedEvents: countOrZero(feedRes),
    journalNotes: countOrZero(journalRes),
  };
}

function mapConfidenceTrend(raw: unknown): CockpitConfidencePoint[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p) => p && typeof p === "object" && ("at" in p || "captured_at" in p))
    .map((p) => ({
      at: safeStr((p as Record<string, unknown>).at ?? (p as Record<string, unknown>).captured_at),
      value: safeNum((p as Record<string, unknown>).value ?? (p as Record<string, unknown>).confidence),
    }));
}

function buildConfidenceHeadline(series: CockpitConfidencePoint[]): string {
  if (series.length === 0) {
    return "Generate or refresh a snapshot after a few chat sessions to see conviction over time.";
  }
  if (series.length === 1) {
    return "Early snapshot — more sessions will sharpen this curve.";
  }
  const first = series[0]?.value ?? 0;
  const last = series[series.length - 1]?.value ?? 0;
  const delta = last - first;
  if (delta > 0.05) {
    return "Conviction has trended higher as AXE learns your book.";
  }
  if (delta < -0.05) {
    return "Conviction dipped recently — journal tags and corrections help recalibrate.";
  }
  return "Conviction has held steady across recent sessions.";
}

function mapLearningProgress(raw: unknown): { headline: string; milestones: CockpitLearningMilestone[] } {
  if (!raw || typeof raw !== "object") return { headline: "", milestones: [] };
  const obj = raw as Record<string, unknown>;
  return {
    headline: safeStr(obj.headline),
    milestones: safeArray<CockpitLearningMilestone>(obj.milestones).map((m) => ({
      id: safeStr((m as Record<string, unknown>).id, crypto.randomUUID()),
      label: safeStr((m as Record<string, unknown>).label),
      periodLabel: safeStr((m as Record<string, unknown>).periodLabel ?? (m as Record<string, unknown>).period_label),
      progress: safeNum((m as Record<string, unknown>).progress),
      narrative: safeStr((m as Record<string, unknown>).narrative),
    })),
  };
}

function mapFeedback(raw: unknown): CockpitFeedbackImpact {
  if (!raw || typeof raw !== "object") {
    return { acceptedSetups: 0, rejectedSetups: 0, correctionsCount: 0, correctionLiftPercent: 0, last28dTrend: [] };
  }
  const obj = raw as Record<string, unknown>;
  return {
    acceptedSetups: safeNum(obj.acceptedSetups ?? obj.accepted_setups),
    rejectedSetups: safeNum(obj.rejectedSetups ?? obj.rejected_setups),
    correctionsCount: safeNum(obj.correctionsCount ?? obj.corrections_count),
    correctionLiftPercent: safeNum(obj.correctionLiftPercent ?? obj.correction_lift_percent),
    last28dTrend: safeArray(obj.last28dTrend ?? obj.last_28d_trend).map((w) => ({
      weekLabel: safeStr((w as Record<string, unknown>).weekLabel ?? (w as Record<string, unknown>).week_label),
      corrections: safeNum((w as Record<string, unknown>).corrections),
    })),
  };
}

function mapBehavior(raw: unknown): CockpitBehaviorMap {
  if (!raw || typeof raw !== "object") {
    return { sessions: [], preferredAssets: [], patternTendencies: [] };
  }
  const obj = raw as Record<string, unknown>;
  return {
    sessions: safeArray(obj.sessions).map((s) => ({
      id: safeStr((s as Record<string, unknown>).id, crypto.randomUUID()),
      label: safeStr((s as Record<string, unknown>).label),
      weight: safeNum((s as Record<string, unknown>).weight),
      note: safeStr((s as Record<string, unknown>).note) || undefined,
    })),
    preferredAssets: safeArray(obj.preferredAssets ?? obj.preferred_assets).map((a) => ({
      symbol: safeStr((a as Record<string, unknown>).symbol),
      weight: safeNum((a as Record<string, unknown>).weight),
      context: safeStr((a as Record<string, unknown>).context),
    })),
    patternTendencies: safeArray(obj.patternTendencies ?? obj.pattern_tendencies).map((p) => ({
      id: safeStr((p as Record<string, unknown>).id, crypto.randomUUID()),
      label: safeStr((p as Record<string, unknown>).label),
      strength: safeNum((p as Record<string, unknown>).strength),
    })),
  };
}

export async function getCockpitDashboard(): Promise<CockpitDashboard> {
  const authed = await getAuthedServiceSupabase();

  if (!authed) {
    return EMPTY_DASHBOARD;
  }

  const { supabase, user } = authed;
  const [todayBase, rawLearningArc, traderScores] = await Promise.all([
    fetchCockpitTodaySummary(supabase, user.id),
    getTraderLearningArc(user.id, supabase),
    computeTraderScores(supabase, user.id),
  ]);
  const today: CockpitTodaySummary = todayBase;
  const learningArc: CockpitLearningArc = toCockpitLearningArc(rawLearningArc);

  const [messageCount, memoryCount, journalNotesCount, tradeJournalCount, tradeCount, metricsCount, learningSignalCount] = await Promise.all([
    supabase.from("messages").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("assistant_memory_entries").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("user_journal_entries").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("trade_journal_labels").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("broker_trades").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("assistant_learning_metrics").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("assistant_learning_signals").select("id", { count: "exact", head: true }).eq("user_id", user.id),
  ]);
  const journalCount = countOrZero(journalNotesCount) + countOrZero(tradeJournalCount);
  const counts = {
    messageCount: countOrZero(messageCount),
    memoryCount: countOrZero(memoryCount),
    journalCount,
    tradeCount: countOrZero(tradeCount),
    metricsCount: countOrZero(metricsCount),
    learningSignalCount: countOrZero(learningSignalCount),
  };
  const signalCount =
    counts.messageCount +
    counts.memoryCount +
    counts.journalCount +
    counts.tradeCount +
    counts.metricsCount +
    counts.learningSignalCount;

  // Fetch the two most recent snapshots so we can compute alignment delta
  const { data: snapshots, error: snapErr } = await supabase
    .from("assistant_cockpit_snapshots")
    .select("id,alignment_score,confidence_trend,behavior_map,learning_progress,feedback_loop_stats,captured_at")
    .eq("user_id", user.id)
    .order("captured_at", { ascending: false })
    .limit(2);

  if (snapErr) {
    console.error("[cockpitService] snapshot error:", snapErr.message);
    return {
      ...EMPTY_DASHBOARD,
      today,
      learningArc,
      traderScores,
      calibration: calibrationState({ ...counts, signalCount, hasSnapshot: false, lastCalculatedAt: null }),
    };
  }

  if (!snapshots || snapshots.length === 0) {
    return {
      ...EMPTY_DASHBOARD,
      today,
      learningArc,
      traderScores,
      calibration: calibrationState({ ...counts, signalCount, hasSnapshot: false, lastCalculatedAt: null }),
    };
  }

  const latest = snapshots[0];
  const prior = snapshots[1] ?? null;
  const calibration = calibrationState({
    ...counts,
    signalCount,
    hasSnapshot: true,
    lastCalculatedAt: latest.captured_at,
  });

  // Fetch recent metric keys
  const { data: metrics } = await supabase
    .from("assistant_learning_metrics")
    .select("metric_key")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(10);

  const metricKeysSample = (metrics ?? []).map((m) => m.metric_key as string);

  // ── Staleness detection ──────────────────────────────────────────
  // Check if meaningful new signals arrived since the last snapshot.
  // We count rows created after `captured_at` in the key tables.
  const cutoff = latest.captured_at;
  const [newMsgs, newTrades, newJournals, newMemory, newLearningSignals, newTradeLabels] = await Promise.all([
    supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gt("created_at", cutoff),
    supabase
      .from("broker_trades")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gt("close_time", cutoff),
    supabase
      .from("user_journal_entries")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gt("created_at", cutoff),
    supabase
      .from("assistant_memory_entries")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gt("created_at", cutoff),
    supabase
      .from("assistant_learning_signals")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gt("created_at", cutoff),
    supabase
      .from("trade_journal_labels")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gt("updated_at", cutoff),
  ]);
  const newTradeSignals = countOrZero(newTrades) + countOrZero(newTradeLabels) + countOrZero(newLearningSignals);
  const newOtherSignals =
    countOrZero(newMsgs) + countOrZero(newJournals) + countOrZero(newMemory);
  const newSignalCount = newTradeSignals + newOtherSignals;

  // Auto-refresh when a trade closes/journals, or meaningful new chat/memory arrives.
  const snapshotAgeMs = Date.now() - new Date(cutoff).getTime();
  const staleHours = snapshotAgeMs / (1000 * 60 * 60);
  const shouldAutoRefresh =
    newTradeSignals >= 1 ||
    newOtherSignals >= 2 ||
    (staleHours >= 12 && newSignalCount >= 1);

  return {
    snapshotId: latest.id,
    shouldAutoRefresh,
    alignment: mapAlignment(
      latest.alignment_score ?? 0,
      latest.captured_at,
      prior?.alignment_score ?? null
    ),
    confidence: {
      headline: buildConfidenceHeadline(mapConfidenceTrend(latest.confidence_trend)),
      series: mapConfidenceTrend(latest.confidence_trend),
    },
    learningProgress: mapLearningProgress(latest.learning_progress),
    feedback: mapFeedback(latest.feedback_loop_stats),
    behavior: mapBehavior(latest.behavior_map),
    metricKeysSample,
    calibration,
    today: await fetchCockpitTodaySummary(supabase, user.id),
    learningArc,
    traderScores,
  };
}
