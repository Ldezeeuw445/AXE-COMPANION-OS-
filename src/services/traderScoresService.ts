import type { SupabaseClient } from "@supabase/supabase-js";
import type { CockpitTraderScores } from "@/types/cockpit";

const LOOKBACK_DAYS = 90;
const IMPATIENT_LABELS = new Set(["impatient", "emotional", "poor"]);
const POSITIVE_LABELS = new Set(["perfect", "good", "ok"]);

type JournalBreakdown = {
  rule_adherence?: number;
  playbook_alignment?: number;
  risk_management?: number;
  emotional_discipline?: number;
};

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(Math.min(100, Math.max(0, n)));
}

function dimToScore(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return clampScore(n * 4);
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function parseBreakdown(raw: unknown): JournalBreakdown | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as JournalBreakdown;
}

export async function computeTraderScores(
  supabase: SupabaseClient,
  userId: string,
): Promise<CockpitTraderScores> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();

  const [labelsRes, signalsRes, execRes, tradesRes] = await Promise.all([
    supabase
      .from("trade_journal_labels")
      .select("alignment_score,axe_label,axe_journal,updated_at")
      .eq("user_id", userId)
      .gte("updated_at", since)
      .order("updated_at", { ascending: false })
      .limit(120),
    supabase
      .from("assistant_learning_signals")
      .select("signal_type,payload,created_at")
      .eq("user_id", userId)
      .in("signal_type", ["trade_alignment", "journal_label"])
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(400),
    supabase
      .from("execution_requests")
      .select("status,created_at")
      .eq("user_id", userId)
      .gte("created_at", since)
      .limit(200),
    supabase
      .from("broker_trades")
      .select("open_time,close_time,pnl")
      .eq("user_id", userId)
      .not("close_time", "is", null)
      .gte("close_time", since)
      .order("close_time", { ascending: false })
      .limit(200),
  ]);

  const labels = labelsRes.data ?? [];
  const signals = signalsRes.data ?? [];
  const executions = execRes.data ?? [];
  const trades = tradesRes.data ?? [];

  const disciplineDims: number[] = [];
  const riskDims: number[] = [];
  const executionDims: number[] = [];
  const alignmentScores: number[] = [];
  let impatientCount = 0;
  let positiveLabelCount = 0;
  let labeledCount = 0;

  for (const row of labels) {
    const breakdown = parseBreakdown(row.axe_journal);
    if (breakdown) {
      const disc = dimToScore(breakdown.emotional_discipline);
      const risk = dimToScore(breakdown.risk_management);
      const playbook = dimToScore(breakdown.playbook_alignment);
      const rules = dimToScore(breakdown.rule_adherence);
      if (disc != null) disciplineDims.push(disc);
      if (risk != null) riskDims.push(risk);
      const execParts = [playbook, rules].filter((n): n is number => n != null);
      const execAvg = avg(execParts);
      if (execAvg != null) executionDims.push(execAvg);
    }

    const align = Number(row.alignment_score);
    if (Number.isFinite(align) && align >= 0) alignmentScores.push(align);

    const label = String(row.axe_label ?? "").toLowerCase();
    if (label) {
      labeledCount += 1;
      if (IMPATIENT_LABELS.has(label)) impatientCount += 1;
      if (POSITIVE_LABELS.has(label)) positiveLabelCount += 1;
    }
  }

  for (const row of signals) {
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    if (row.signal_type === "trade_alignment") {
      const score = Number(payload.alignment_score ?? 0);
      if (Number.isFinite(score) && score > 0) alignmentScores.push(score);
      const breakdown = parseBreakdown(payload.breakdown ?? payload.axe_journal);
      if (breakdown) {
        const disc = dimToScore(breakdown.emotional_discipline);
        const risk = dimToScore(breakdown.risk_management);
        const playbook = dimToScore(breakdown.playbook_alignment);
        const rules = dimToScore(breakdown.rule_adherence);
        if (disc != null) disciplineDims.push(disc);
        if (risk != null) riskDims.push(risk);
        const execParts = [playbook, rules].filter((n): n is number => n != null);
        const execAvg = avg(execParts);
        if (execAvg != null) executionDims.push(execAvg);
      }
      const label = String(payload.axe_label ?? "").toLowerCase();
      if (label) {
        labeledCount += 1;
        if (IMPATIENT_LABELS.has(label)) impatientCount += 1;
        if (POSITIVE_LABELS.has(label)) positiveLabelCount += 1;
      }
    } else if (row.signal_type === "journal_label") {
      const label = String(payload.label ?? "").toLowerCase();
      if (label) {
        labeledCount += 1;
        if (IMPATIENT_LABELS.has(label)) impatientCount += 1;
        if (POSITIVE_LABELS.has(label)) positiveLabelCount += 1;
      }
    }
  }

  const filled = executions.filter((e) => {
    const s = String(e.status ?? "").toLowerCase();
    return s.includes("filled") || s.includes("executed") || s === "done";
  }).length;
  const execTotal = executions.length;
  const fillRate = execTotal > 0 ? filled / execTotal : null;

  let executionScore = avg(executionDims);
  if (executionScore != null && fillRate != null) {
    executionScore = clampScore(executionScore * 0.75 + fillRate * 100 * 0.25);
  } else if (executionScore == null && fillRate != null) {
    executionScore = clampScore(fillRate * 100);
  }

  const tradesPerWeek =
    trades.length > 0 ? trades.length / Math.max(1, LOOKBACK_DAYS / 7) : 0;
  let patienceFromLabels: number | null = null;
  if (labeledCount > 0) {
    const impatienceRate = impatientCount / labeledCount;
    const positiveRate = positiveLabelCount / labeledCount;
    patienceFromLabels = clampScore(positiveRate * 70 + (1 - impatienceRate) * 30);
  }

  let patienceFromFrequency: number | null = null;
  if (trades.length >= 3) {
    if (tradesPerWeek <= 3) patienceFromFrequency = 85;
    else if (tradesPerWeek <= 7) patienceFromFrequency = 70;
    else if (tradesPerWeek <= 14) patienceFromFrequency = 50;
    else patienceFromFrequency = 30;
  }

  const holdHours: number[] = [];
  for (const t of trades) {
    if (!t.open_time || !t.close_time) continue;
    const ms = new Date(t.close_time).getTime() - new Date(t.open_time).getTime();
    if (ms > 0) holdHours.push(ms / 3_600_000);
  }
  const medianHold = holdHours.length
    ? holdHours.sort((a, b) => a - b)[Math.floor(holdHours.length / 2)]
    : null;
  let patienceFromHold: number | null = null;
  if (medianHold != null) {
    if (medianHold >= 4) patienceFromHold = 80;
    else if (medianHold >= 1) patienceFromHold = 65;
    else if (medianHold >= 0.25) patienceFromHold = 45;
    else patienceFromHold = 25;
  }

  const patienceParts = [patienceFromLabels, patienceFromFrequency, patienceFromHold].filter(
    (n): n is number => n != null,
  );
  const patienceScore = patienceParts.length ? clampScore(avg(patienceParts)!) : null;

  const tradeCount = labels.length + signals.filter((s) => s.signal_type === "trade_alignment").length;
  const sampleSize = Math.max(labels.length, alignmentScores.length, trades.length);

  const build = (
    key: CockpitTraderScores["scores"][number]["key"],
    label: string,
    score: number | null,
    hint: string,
  ) => ({
    key,
    label,
    score: score ?? 0,
    available: score != null,
    hint,
  });

  return {
    periodDays: LOOKBACK_DAYS,
    sampleSize,
    tradeCount: trades.length,
    scores: [
      build(
        "discipline",
        "Discipline",
        disciplineDims.length ? clampScore(avg(disciplineDims)!) : null,
        disciplineDims.length
          ? `From ${disciplineDims.length} AXE journal emotional-discipline reads.`
          : "Close trades and let AXE auto-journal to unlock.",
      ),
      build(
        "execution",
        "Execution",
        executionScore,
        executionDims.length || fillRate != null
          ? `Playbook + rule adherence${fillRate != null ? ` · ${Math.round(fillRate * 100)}% fill rate` : ""}.`
          : "Execution score needs journaled trades or filled orders.",
      ),
      build(
        "risk",
        "Risk",
        riskDims.length ? clampScore(avg(riskDims)!) : null,
        riskDims.length
          ? `Average risk-management score across ${riskDims.length} reviews.`
          : "Risk score appears after AXE journals your closes.",
      ),
      build(
        "patience",
        "Patience",
        patienceScore,
        patienceParts.length
          ? `${trades.length} closes · ${labeledCount} labeled · ~${tradesPerWeek.toFixed(1)}/wk`
          : "Patience needs a few closed trades with AXE labels.",
      ),
      build(
        "alignment",
        "Alignment",
        alignmentScores.length ? clampScore(avg(alignmentScores)!) : null,
        alignmentScores.length
          ? `Mean alignment across ${alignmentScores.length} trade reviews.`
          : "Alignment builds from journaled trade reviews.",
      ),
    ],
  };
}
