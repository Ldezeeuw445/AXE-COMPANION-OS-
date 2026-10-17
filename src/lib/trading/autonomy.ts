/**
 * How much AXE may do on its own.
 *
 * Until now there was no ladder: `alert_auto_trade_enabled` was a single
 * switch between "AXE suggests" and "AXE sends live orders to MT5 while you
 * are asleep". The guard in `autoTradeGuard.ts` kept that from being reckless,
 * but every number it used came from the broker's account profile or from a
 * constant in the source. Nowhere had the trader said, in their own words,
 * how much they were willing to lose to a machine.
 *
 * Three levels, and the one that matters is the top one:
 *
 *   1  suggest          AXE may say what it would do. Nothing is prepared.
 *   2  prepare          AXE may build an order and leave it pending. A human
 *                       presses the button. This is the default.
 *   3  place            AXE may place it unattended, inside limits the trader
 *                       set and three statements they ticked.
 *
 * Level 3 is not a toggle. It needs three numbers (max lot, max risk per
 * trade, max trades per day) and three acknowledgements. Miss any one of them
 * and `resolveAutonomy` hands back level 2 with the reason — an incomplete
 * level 3 must never behave like a complete one. That is the whole point of
 * this file: the dangerous state is the half-configured one, and it resolves
 * downwards, loudly.
 *
 * Dependency-free so `node --experimental-strip-types` can exercise it.
 */

export type AutonomyLevel = 1 | 2 | 3;

/** What AXE is about to do, in rising order of consequence. */
export type AutonomyAction = "suggest" | "prepare" | "place";

export const AUTONOMY_LEVELS: readonly {
  level: AutonomyLevel;
  label: string;
  /** One line the trader reads next to the radio button. */
  summary: string;
}[] = [
  { level: 1, label: "Suggest only", summary: "AXE tells you what it would do. It prepares nothing." },
  { level: 2, label: "Prepare, I approve", summary: "AXE builds the order and leaves it pending. You press the button." },
  { level: 3, label: "Place within my limits", summary: "AXE may place it unattended, inside the limits you set below." },
];

/** The three statements that have to be true before level 3 means anything. */
export const AUTONOMY_ACK_KEYS = ["unattended", "limits", "loss"] as const;
export type AutonomyAckKey = (typeof AUTONOMY_ACK_KEYS)[number];

export const AUTONOMY_ACK_TEXT: Record<AutonomyAckKey, string> = {
  unattended:
    "I understand AXE can send live orders to my broker while I am not watching.",
  limits:
    "The limits below are mine. AXE will refuse an order that breaks one — it will never place a smaller trade instead.",
  loss:
    "I can lose money on trades I did not press a button for, including the full daily loss limit of this account.",
};

export type AutonomyAcks = Record<AutonomyAckKey, boolean>;

export type AutonomySettings = {
  /** What the trader chose. Not necessarily what applies — see resolveAutonomy. */
  level: AutonomyLevel;
  /** Hard ceiling on order size, in lots. */
  maxLot: number | null;
  /** Hard ceiling on what one trade may risk, as a percent of equity. */
  maxRiskPct: number | null;
  /** Hard ceiling on unattended orders in a day. */
  maxTradesPerDay: number | null;
  acks: AutonomyAcks;
  /** When all three were last ticked. Null while any is false. */
  grantedAt: string | null;
};

export const DEFAULT_AUTONOMY: AutonomySettings = {
  // Level 2 by default: AXE prepares, a human presses. Anything higher is a
  // decision a trader makes on purpose, not one they inherit from a default.
  level: 2,
  maxLot: null,
  maxRiskPct: null,
  maxTradesPerDay: null,
  acks: { unattended: false, limits: false, loss: false },
  grantedAt: null,
};

export function isAutonomyLevel(value: unknown): value is AutonomyLevel {
  return value === 1 || value === 2 || value === 3;
}

/** Clamp a stored number into something that can be a limit. */
export function normalizeLimit(value: unknown, max: number): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(n, max);
}

/** Ceilings on the ceilings, so a typo cannot become a licence. */
export const AUTONOMY_MAX_LOT_CEILING = 50;
export const AUTONOMY_MAX_RISK_PCT_CEILING = 10;
export const AUTONOMY_MAX_TRADES_CEILING = 20;

export type AutonomyResolution = {
  /** What actually applies right now. */
  level: AutonomyLevel;
  /** What is stored. */
  requested: AutonomyLevel;
  /** True when `level` is lower than `requested`. */
  downgraded: boolean;
  /** One sentence per missing piece, ready to show. Empty when nothing is missing. */
  missing: string[];
};

/**
 * What the stored settings actually permit.
 *
 * A level 3 that is missing a number or a tick resolves to level 2. It does
 * not fail, and it does not quietly behave like 3: it comes back as 2 with a
 * list of what is missing, so the UI and the feed can both say the same thing.
 */
export function resolveAutonomy(settings: AutonomySettings): AutonomyResolution {
  const requested = isAutonomyLevel(settings.level) ? settings.level : 2;
  if (requested < 3) return { level: requested, requested, downgraded: false, missing: [] };

  const missing: string[] = [];
  if (settings.maxLot === null) missing.push("a maximum lot size");
  if (settings.maxRiskPct === null) missing.push("a maximum risk per trade");
  if (settings.maxTradesPerDay === null) missing.push("a maximum number of trades per day");
  for (const key of AUTONOMY_ACK_KEYS) {
    if (!settings.acks[key]) missing.push(`the acknowledgement: “${AUTONOMY_ACK_TEXT[key]}”`);
  }

  if (missing.length > 0) return { level: 2, requested, downgraded: true, missing };
  return { level: 3, requested, downgraded: false, missing: [] };
}

/** True once every acknowledgement is ticked. */
export function allAcked(acks: AutonomyAcks): boolean {
  return AUTONOMY_ACK_KEYS.every((k) => acks[k]);
}

const ACTION_NEEDS: Record<AutonomyAction, AutonomyLevel> = {
  suggest: 1,
  prepare: 2,
  place: 3,
};

export type AutonomyDecision =
  | { allowed: true; level: AutonomyLevel }
  | { allowed: false; reason: "autonomy_level"; detail: string; level: AutonomyLevel };

/**
 * May AXE do this, unattended?
 *
 * `attended` is a human pressing the button for this specific order. It lifts
 * the level requirement, because the trader is the one acting — the account's
 * own rules in autoTradeGuard still apply and do not care who clicked.
 */
export function autonomyAllows(
  action: AutonomyAction,
  settings: AutonomySettings,
  attended = false,
): AutonomyDecision {
  const resolved = resolveAutonomy(settings);
  if (attended) return { allowed: true, level: resolved.level };

  const needed = ACTION_NEEDS[action];
  if (resolved.level >= needed) return { allowed: true, level: resolved.level };

  const detail =
    resolved.downgraded && action === "place"
      ? `Not placed: AXE is set to place trades on its own, but that is not switched on yet — still missing ${listOf(resolved.missing)}. Until then AXE prepares the order and waits for you.`
      : action === "place"
        ? `Not placed: AXE is set to “${AUTONOMY_LEVELS[resolved.level - 1].label}”. Raise it to “Place within my limits” in Settings if you want AXE to place orders unattended.`
        : `AXE is set to “${AUTONOMY_LEVELS[resolved.level - 1].label}”, which does not include preparing orders.`;

  return { allowed: false, reason: "autonomy_level", detail, level: resolved.level };
}

function listOf(items: string[]): string {
  if (items.length === 1) return items[0]!;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * The tighter of two ceilings, where null means "no ceiling from this side".
 *
 * The account profile and the trader both get to say no. Taking the smaller
 * one is the only answer that respects both: a prop firm's 2-lot cap does not
 * become 5 because the trader typed 5, and the trader's 0.5 does not become 2
 * because the broker allows it.
 */
export function tighter(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.min(a, b);
}
