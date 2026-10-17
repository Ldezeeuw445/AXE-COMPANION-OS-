/**
 * How much does AXE actually know about you, and is that growing?
 *
 * The existing learning arc shows a present-tense profile: top pairs, top
 * timeframes, an alignment score. Useful, but it cannot answer the question
 * Luka actually asked — "can you see it growing with you?" A snapshot has no
 * direction.
 *
 * So this counts things that genuinely exist, compares them to a month ago,
 * and names what that adds up to. Two rules hold it honest:
 *
 *  1. Nothing here is invented. Every number is a row somebody can go and
 *     look at: a memory, a scored trade, a rule, a playbook, a time AXE spoke
 *     first. A progress bar that creeps up on its own would be worse than no
 *     bar at all, because it would make the real one untrustworthy.
 *  2. It says what is still missing. "Stage 2 of 4" with no idea how to reach
 *     3 is a scoreboard, not a guide.
 *
 * Dependency-free so it can be exercised with `node --experimental-strip-types`.
 */

export type LearningSignalCounts = {
  /** Unresolved rows in axe_memory — things AXE remembers about this trader. */
  memories: number;
  /** Trades AXE scored itself. */
  journaledTrades: number;
  /** Rules the trader wrote down. */
  rules: number;
  /** Playbooks the trader wrote down. */
  playbooks: number;
  /** Times AXE said something first, without being asked. */
  proactiveNotices: number;
};

export type LearningStage = {
  /** 0-4. */
  stage: number;
  name: string;
  /** What AXE can do at this stage, in the trader's terms. */
  summary: string;
  /** The one thing that would move it along. Null at the top stage. */
  nextStep: string | null;
  /** Weighted total behind the stage, so the bar has something real under it. */
  points: number;
  pointsForNextStage: number | null;
  /** Growth since the comparison window, or null when there is no history. */
  growth: {
    points: number;
    counts: Partial<LearningSignalCounts>;
    /** One sentence, or null when nothing changed. */
    summary: string | null;
  } | null;
};

/**
 * Weights, and why.
 *
 * A scored trade is worth more than a remembered fact because it is grounded
 * in something that actually happened with money on it. A rule the trader
 * wrote down is worth the most per item: it is the clearest statement of
 * intent AXE will ever get, and there are never many of them.
 */
const WEIGHTS: Record<keyof LearningSignalCounts, number> = {
  memories: 2,
  journaledTrades: 3,
  rules: 5,
  playbooks: 5,
  proactiveNotices: 1,
};

const STAGES: Array<{ at: number; name: string; summary: string; nextStep: string | null }> = [
  {
    at: 0,
    name: "Getting to know you",
    summary: "AXE has nothing of yours to work from yet. Everything it says is general.",
    nextStep: "Connect your account and let one trade close. That is the first thing AXE can learn from.",
  },
  {
    at: 15,
    name: "Watching",
    summary: "AXE is scoring your trades and starting to keep notes on how you trade.",
    nextStep: "Write down one rule you trade by. A stated rule teaches AXE more than ten trades.",
  },
  {
    at: 45,
    name: "Recognising",
    summary: "AXE can see your patterns — which setups you take, where you lose, what time of day suits you.",
    nextStep: "Add a playbook for the setup you take most. Then AXE can judge a trade against your own plan.",
  },
  {
    at: 100,
    name: "Anticipating",
    summary: "AXE knows your rules and your weak spots well enough to speak before you ask.",
    nextStep: "Keep trading and journalling. From here it sharpens rather than grows.",
  },
  {
    at: 200,
    name: "Second brain",
    summary: "AXE carries your rules, your playbooks and your history into every answer it gives.",
    nextStep: null,
  },
];

export function learningPoints(counts: LearningSignalCounts): number {
  let total = 0;
  for (const key of Object.keys(WEIGHTS) as Array<keyof LearningSignalCounts>) {
    const n = Number(counts[key] ?? 0);
    if (Number.isFinite(n) && n > 0) total += n * WEIGHTS[key];
  }
  return Math.round(total);
}

const LABELS: Record<keyof LearningSignalCounts, [string, string]> = {
  memories: ["thing it remembers about you", "things it remembers about you"],
  journaledTrades: ["trade scored", "trades scored"],
  rules: ["rule of yours", "rules of yours"],
  playbooks: ["playbook", "playbooks"],
  proactiveNotices: ["time it spoke first", "times it spoke first"],
};

function plural(key: keyof LearningSignalCounts, n: number): string {
  const [one, many] = LABELS[key];
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * @param counts  where the trader stands now
 * @param before  the same counts at the start of the window, when known
 */
export function learningStage(
  counts: LearningSignalCounts,
  before?: LearningSignalCounts | null,
): LearningStage {
  const points = learningPoints(counts);

  let index = 0;
  for (let i = 0; i < STAGES.length; i += 1) {
    if (points >= STAGES[i]!.at) index = i;
  }
  const stage = STAGES[index]!;
  const next = STAGES[index + 1] ?? null;

  let growth: LearningStage["growth"] = null;
  if (before) {
    const deltas: Partial<LearningSignalCounts> = {};
    const named: string[] = [];
    for (const key of Object.keys(WEIGHTS) as Array<keyof LearningSignalCounts>) {
      const diff = Number(counts[key] ?? 0) - Number(before[key] ?? 0);
      if (diff > 0) {
        deltas[key] = diff;
        named.push(plural(key, diff));
      }
    }
    const gained = points - learningPoints(before);
    growth = {
      points: gained,
      counts: deltas,
      summary: named.length ? `This month AXE picked up ${joinList(named)}.` : null,
    };
  }

  return {
    stage: index,
    name: stage.name,
    summary: stage.summary,
    nextStep: stage.nextStep,
    points,
    pointsForNextStage: next ? next.at : null,
    growth,
  };
}

function joinList(items: string[]): string {
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** 0-1, for a progress bar. Full at the top stage. */
export function stageProgress(arc: LearningStage): number {
  if (arc.pointsForNextStage === null) return 1;
  const floor = STAGES[arc.stage]!.at;
  const span = arc.pointsForNextStage - floor;
  if (span <= 0) return 1;
  return Math.max(0, Math.min(1, (arc.points - floor) / span));
}
