import { getAuthedServiceSupabase } from "@/services/serviceSupabase";
import type {
  CockpitDashboard,
  CockpitAlignment,
  CockpitBehaviorMap,
  CockpitFeedbackImpact,
  CockpitConfidencePoint,
  CockpitLearningMilestone,
} from "@/types/cockpit";

const EMPTY_DASHBOARD: CockpitDashboard = {
  snapshotId: "",
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
    message: "AXE needs real chat, journal, memory, or trade signals before it can score alignment.",
  },
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

function calibrationState(signalCount: number, hasSnapshot: boolean): CockpitDashboard["calibration"] {
  if (signalCount < 5) {
    return {
      state: "insufficient_data",
      signalCount,
      message: "Not enough real signals yet. Chat, journal notes, trades, and saved memory will calibrate AXE.",
    };
  }
  if (!hasSnapshot || signalCount < 12) {
    return {
      state: "calibrating",
      signalCount,
      message: "AXE is calibrating from early real signals. Scores stay conservative until more history exists.",
    };
  }
  return {
    state: "active",
    signalCount,
    message: "Alignment is based on current saved context, messages, journal patterns, and account history.",
  };
}

function countOrZero(result: { count: number | null; error?: unknown }): number {
  if (result.error) return 0;
  return result.count ?? 0;
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

  const [messageCount, memoryCount, journalCount, tradeCount, metricsCount] = await Promise.all([
    supabase.from("messages").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("assistant_memory_entries").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("user_journal_entries").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("broker_trades").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("assistant_learning_metrics").select("id", { count: "exact", head: true }).eq("user_id", user.id),
  ]);
  const signalCount =
    countOrZero(messageCount) +
    countOrZero(memoryCount) +
    countOrZero(journalCount) +
    countOrZero(tradeCount) +
    countOrZero(metricsCount);

  // Fetch the two most recent snapshots so we can compute alignment delta
  const { data: snapshots, error: snapErr } = await supabase
    .from("assistant_cockpit_snapshots")
    .select("id,alignment_score,confidence_trend,behavior_map,learning_progress,feedback_loop_stats,captured_at")
    .eq("user_id", user.id)
    .order("captured_at", { ascending: false })
    .limit(2);

  if (snapErr) {
    console.error("[cockpitService] snapshot error:", snapErr.message);
    return { ...EMPTY_DASHBOARD, calibration: calibrationState(signalCount, false) };
  }

  if (!snapshots || snapshots.length === 0) {
    return { ...EMPTY_DASHBOARD, calibration: calibrationState(signalCount, false) };
  }

  const latest = snapshots[0];
  const prior = snapshots[1] ?? null;
  const calibration = calibrationState(signalCount, true);

  // Fetch recent metric keys
  const { data: metrics } = await supabase
    .from("assistant_learning_metrics")
    .select("metric_key")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(10);

  const metricKeysSample = (metrics ?? []).map((m) => m.metric_key as string);

  return {
    snapshotId: latest.id,
    alignment: mapAlignment(
      latest.alignment_score ?? 0,
      latest.captured_at,
      prior?.alignment_score ?? null
    ),
    confidence: {
      headline: "",
      series: mapConfidenceTrend(latest.confidence_trend),
    },
    learningProgress: mapLearningProgress(latest.learning_progress),
    feedback: mapFeedback(latest.feedback_loop_stats),
    behavior: mapBehavior(latest.behavior_map),
    metricKeysSample,
    calibration,
  };
}
