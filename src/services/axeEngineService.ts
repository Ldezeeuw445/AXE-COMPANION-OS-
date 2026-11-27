import type { SupabaseClient } from "@supabase/supabase-js";
import { normaliseAlignment } from "@/lib/axe/learningArc";
import { coachingModeFromLearning } from "@/lib/axe/learningModel";
import { getLearningModel } from "@/services/learningModelService";

export type AxeEngineConfidenceTier = "low" | "medium" | "high";
export type AxeEngineGateMode = "strict" | "guided" | "proactive";

export type AxeEngineProfile = {
  userId: string;
  engineName: string;
  engineVersion: string;
  confidenceScore: number;
  confidenceTier: AxeEngineConfidenceTier;
  gateMode: AxeEngineGateMode;
  alignmentScore: number;
  signalCount: number;
  tradeLabelCount: number;
  memoryCount: number;
  snapshotCapturedAt: string | null;
  rationale: Record<string, unknown>;
  updatedAt: string;
};

type EngineProfileRow = {
  user_id: string;
  engine_name: string;
  engine_version: string;
  confidence_score: number;
  confidence_tier: AxeEngineConfidenceTier;
  gate_mode: AxeEngineGateMode;
  alignment_score: number;
  signal_count: number;
  trade_label_count: number;
  memory_count: number;
  snapshot_captured_at: string | null;
  rationale: Record<string, unknown> | null;
  updated_at: string;
};

const ENGINE_PROFILE_REFRESH_MS = Number(process.env.AXE_ENGINE_REFRESH_MS ?? 30 * 60 * 1000);
const ENGINE_PROFILE_CACHE_MS = Number(process.env.AXE_ENGINE_CACHE_MS ?? 3 * 60 * 1000);
const localCache = new Map<string, { profile: AxeEngineProfile; expiresAt: number }>();

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function toProfile(row: EngineProfileRow): AxeEngineProfile {
  return {
    userId: row.user_id,
    engineName: row.engine_name ?? "AXE One",
    engineVersion: row.engine_version ?? "v1",
    confidenceScore: clampInt(Number(row.confidence_score ?? 0), 0, 100),
    confidenceTier: row.confidence_tier ?? "low",
    gateMode: row.gate_mode ?? "strict",
    alignmentScore: Number(row.alignment_score ?? 0),
    signalCount: Number(row.signal_count ?? 0),
    tradeLabelCount: Number(row.trade_label_count ?? 0),
    memoryCount: Number(row.memory_count ?? 0),
    snapshotCapturedAt: row.snapshot_captured_at ?? null,
    rationale:
      row.rationale && typeof row.rationale === "object"
        ? (row.rationale as Record<string, unknown>)
        : {},
    updatedAt: row.updated_at,
  };
}

function cached(userId: string): AxeEngineProfile | null {
  const hit = localCache.get(userId);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    localCache.delete(userId);
    return null;
  }
  return hit.profile;
}

function remember(profile: AxeEngineProfile): void {
  localCache.set(profile.userId, {
    profile,
    expiresAt: Date.now() + Math.max(30_000, ENGINE_PROFILE_CACHE_MS),
  });
}

export function buildAxeEngineSystemGate(profile: AxeEngineProfile): string {
  const head = `AXE ENGINE (${profile.engineName} ${profile.engineVersion}) — confidence ${profile.confidenceScore}/100 (${profile.confidenceTier}), gate ${profile.gateMode}.`;
  if (profile.gateMode === "proactive") {
    return `${head}
Use decisive, proactive coaching. You may surface opportunities without waiting for explicit asks, but stay anchored to active account, pair, and broker price regime.`;
  }
  if (profile.gateMode === "guided") {
    return `${head}
Use guided coaching: provide clear options and a preferred path, but phrase trade ideas as scenario-based unless confirmed by live broker context.`;
  }
  return `${head}
Use strict coaching: avoid hard predictions, keep guidance conservative, and ask one clarifying question before prescriptive trade actions when confidence is low.`;
}

export async function refreshAxeEngineProfile(
  supabase: SupabaseClient,
  userId: string,
  source: string = "runtime",
): Promise<AxeEngineProfile> {
  const startedAt = Date.now();

  try {
    const [snapshotRes, signalCountRes, tradeLabelCountRes, memoryCountRes] = await Promise.all([
      supabase
        .from("assistant_cockpit_snapshots")
        .select("alignment_score, signal_count, captured_at")
        .eq("user_id", userId)
        .order("captured_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("assistant_learning_signals")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
      supabase
        .from("trade_journal_labels")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
      supabase
        .from("assistant_memory_entries")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
    ]);

    /*
     * Coaching mode (how freely AXE speaks) now follows AXE learning model v2
     * — the same AXE fit the cockpit and brief show (Luka t72u). The old
     * input was 55% a smoothed, pinned alignment score plus activity counts
     * that saturate, so the mode could not reflect what AXE actually knows.
     * While the model is still learning, or cannot be read, the mode is the
     * most conservative one. This only selects the prompt/brief mode; it does
     * not touch order or auto-trade execution.
     */
    const learning = await getLearningModel(supabase, userId).catch(() => null);
    const decision = coachingModeFromLearning(learning?.state ?? null);
    const confidenceScore = clampInt(decision.confidenceScore, 0, 100);
    const tier = decision.tier;
    const gateMode = decision.gateMode;
    const measuredAlignment = learning?.state.score ?? null;
    const alignmentPct = clampInt(measuredAlignment ?? 0, 0, 100);
    const signalCount = Number(signalCountRes.count ?? 0);
    const tradeLabelCount = Number(tradeLabelCountRes.count ?? 0);
    const memoryCount = Number(memoryCountRes.count ?? 0);
    const snapshotSignalCount = Number(snapshotRes.data?.signal_count ?? 0);
    const totalSignals = Math.max(signalCount, snapshotSignalCount);
    const rationale: Record<string, unknown> = {
      model: "learning_v2",
      reason: decision.reason,
      alignmentPct,
      /** False means `alignmentPct` is 0 because AXE is still learning, not a measurement. */
      alignmentMeasured: measuredAlignment !== null,
      learningStatus: learning?.state.status ?? "unavailable",
      learningConfidence: learning?.state.confidence ?? "insufficient",
      dataPoints: learning?.state.dataPoints ?? 0,
      requiredPoints: learning?.state.requiredPoints ?? null,
      /** Legacy snapshot score, kept for comparison only — no longer an input. */
      legacyAlignmentPct: normaliseAlignment(snapshotRes.data?.alignment_score),
      totalSignals,
      source,
    };
    const updatedAt = new Date().toISOString();

    const payload = {
      user_id: userId,
      engine_name: "AXE One",
      engine_version: "v1",
      confidence_score: confidenceScore,
      confidence_tier: tier,
      gate_mode: gateMode,
      alignment_score: alignmentPct / 100,
      signal_count: totalSignals,
      trade_label_count: tradeLabelCount,
      memory_count: memoryCount,
      snapshot_captured_at: snapshotRes.data?.captured_at ?? null,
      rationale,
      updated_at: updatedAt,
    };

    await supabase
      .from("axe_engine_profiles")
      .upsert(payload, { onConflict: "user_id" });

    await supabase.from("axe_engine_runs").insert({
      user_id: userId,
      source,
      status: "ok",
      latency_ms: Date.now() - startedAt,
      confidence_score: confidenceScore,
      confidence_tier: tier,
      gate_mode: gateMode,
      details: rationale,
    });

    const profile: AxeEngineProfile = {
      userId,
      engineName: "AXE One",
      engineVersion: "v1",
      confidenceScore,
      confidenceTier: tier,
      gateMode,
      alignmentScore: alignmentPct / 100,
      signalCount: totalSignals,
      tradeLabelCount,
      memoryCount,
      snapshotCapturedAt: snapshotRes.data?.captured_at ?? null,
      rationale,
      updatedAt,
    };
    remember(profile);
    return profile;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase.from("axe_engine_runs").insert({
      user_id: userId,
      source,
      status: "error",
      latency_ms: Date.now() - startedAt,
      details: {},
      error: msg.slice(0, 500),
    });
    throw err;
  }
}

export async function getAxeEngineProfile(
  supabase: SupabaseClient,
  userId: string,
  opts?: { forceRefresh?: boolean; source?: string },
): Promise<AxeEngineProfile> {
  const source = opts?.source ?? "runtime";
  if (!opts?.forceRefresh) {
    const hit = cached(userId);
    if (hit) return hit;
  }

  const { data } = await supabase
    .from("axe_engine_profiles")
    .select(
      "user_id,engine_name,engine_version,confidence_score,confidence_tier,gate_mode,alignment_score,signal_count,trade_label_count,memory_count,snapshot_captured_at,rationale,updated_at",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) {
    return refreshAxeEngineProfile(supabase, userId, source);
  }

  const profile = toProfile(data as EngineProfileRow);
  const ageMs = Date.now() - new Date(profile.updatedAt).getTime();
  if (opts?.forceRefresh || ageMs > Math.max(60_000, ENGINE_PROFILE_REFRESH_MS)) {
    return refreshAxeEngineProfile(supabase, userId, source);
  }

  remember(profile);
  return profile;
}
