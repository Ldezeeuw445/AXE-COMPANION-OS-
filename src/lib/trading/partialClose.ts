/**
 * Closing part of a position.
 *
 * Build-list item 11, and the reason it is called the biggest gap: taking
 * half off after a winning move is the most common thing a trader does, and
 * `close-position` could only close all of it. Someone who wants to scale out
 * has to open MT5 to do something they came here for — and then they stay
 * there.
 *
 * The arithmetic is trivial. What is not trivial is the remainder.
 *
 * A broker works in lot steps, usually 0.01, with a minimum order size to
 * match. Close 0.095 of a 0.10 position and the 0.005 left behind is smaller
 * than anything that can be traded: the trader is left holding a position
 * they cannot close, modify or add to. MT5 rejects that outright, and the
 * worst version of this feature is one that accepts the request here and
 * surfaces the rejection as a generic broker error three seconds later.
 *
 * So the rule is decided before anything is sent: a partial close must leave
 * either nothing, or a remainder the broker will still deal with. When it
 * cannot, say which of the two it should have been — closing the lot, or
 * taking less — because those are the only two things the trader can do next.
 *
 * Dependency-free so the verify suite exercises it directly.
 */

/** Smallest tradable size, in lots. Matches the order route's floor. */
export const MIN_LOT = 0.01;

/**
 * Smallest increment a size may move in.
 *
 * Equal to `MIN_LOT` on every broker this app has met, and modelled
 * separately anyway — they are two different facts and brokers exist where
 * they differ (step 0.01, minimum order 0.10). Keeping them apart is also
 * what makes the remainder rule reachable: while step and minimum are the
 * same number, a remainder can only ever be zero or at least the minimum, and
 * a rule that cannot fire is a rule that is not there.
 */
export const LOT_STEP = 0.01;

export type LotRules = {
  minLot: number;
  lotStep: number;
};

export const DEFAULT_LOT_RULES: LotRules = { minLot: MIN_LOT, lotStep: LOT_STEP };

/**
 * Lot sizes are decimal fractions binary floating point cannot hold exactly:
 * measured, `0.3 - 0.1` is 0.19999999999999998 and `0.1 - 0.09` is
 * 0.010000000000000009. Comparing either against a broker minimum lands
 * wrong, so everything below works in whole hundredths of a lot.
 */
function toSteps(lots: number, step: number): number {
  return Math.round(lots / step);
}

function round2(lots: number): number {
  return Math.round(lots * 100) / 100;
}

/**
 * Whether a size sits on a whole lot step.
 *
 * This exists because rounding alone is dangerous here. `toSteps(0.005)` is
 * `Math.round(0.5)`, which is 1 — so a request for half the minimum silently
 * became a request for the minimum, and on a 0.01 position that is the whole
 * thing. The trader asks to take a sliver off and the position closes.
 *
 * A size that is not on a step is a mistake, not something to round into
 * shape. The tolerance is for float noise (0.07 * 100 is 7.000000000000001),
 * not for genuinely off-step values.
 */
function isOnStep(lots: number, step: number): boolean {
  const scaled = lots / step;
  return Math.abs(scaled - Math.round(scaled)) < 1e-6;
}

export type PartialCloseRequest = {
  /** What the position currently holds, in lots. */
  positionVolume: number;
  /** What the trader asked to close, in lots. */
  requested: number;
};

export type PartialCloseDecision =
  | { kind: "full"; volume: number }
  | { kind: "partial"; volume: number; remainder: number }
  | { kind: "rejected"; reason: string };

/**
 * What this request actually is, or why it cannot be one.
 *
 * Returns `full` when the requested size is the whole position — including
 * when it was asked for as a partial that happens to be everything. The
 * caller then takes the simpler path rather than asking a broker to close
 * "all of it" by volume, which is the same thing stated less clearly.
 */
/**
 * What can be said about a requested size without knowing the position.
 *
 * The close route holds a MetaApi position id and no volume — the broker has
 * that. So the server checks what it can before spending a round trip: a size
 * that is zero, negative, off-step or under the minimum is a mistake here,
 * not something to find out from a broker rejection three seconds later.
 * Whether it fits *this* position is still MetaApi's answer.
 *
 * Returns null when there is nothing wrong with it.
 */
export function rejectRequestedVolume(
  requested: number,
  rules: LotRules = DEFAULT_LOT_RULES,
): string | null {
  const want = Number(requested);
  const { minLot, lotStep } = rules;

  if (!Number.isFinite(want) || want <= 0) {
    return "the amount to close must be greater than zero";
  }
  if (!isOnStep(want, lotStep)) {
    return `${want} lots is not a whole step of ${lotStep} — a broker trades in ${lotStep} increments`;
  }
  if (want < minLot - 1e-9) {
    return `the smallest a broker will take is ${minLot} lots`;
  }
  return null;
}

export function decidePartialClose(
  req: PartialCloseRequest,
  rules: LotRules = DEFAULT_LOT_RULES,
): PartialCloseDecision {
  const total = Number(req.positionVolume);
  const want = Number(req.requested);
  const { minLot, lotStep } = rules;

  if (!Number.isFinite(total) || total <= 0) {
    return { kind: "rejected", reason: "this position has no volume to close" };
  }
  if (!Number.isFinite(want) || want <= 0) {
    return { kind: "rejected", reason: "the amount to close must be greater than zero" };
  }

  if (!isOnStep(want, lotStep)) {
    return {
      kind: "rejected",
      reason: `${want} lots is not a whole step of ${lotStep} — a broker trades in ${lotStep} increments`,
    };
  }

  const totalSteps = toSteps(total, lotStep);
  const wantSteps = toSteps(want, lotStep);

  if (wantSteps > totalSteps) {
    return {
      kind: "rejected",
      reason: `you asked to close ${want} lots but the position is ${total}`,
    };
  }
  if (want < minLot - 1e-9) {
    return { kind: "rejected", reason: `the smallest a broker will take is ${minLot} lots` };
  }
  if (wantSteps === totalSteps) {
    return { kind: "full", volume: total };
  }

  const remainder = round2((totalSteps - wantSteps) * lotStep);
  if (remainder < minLot - 1e-9) {
    // Reachable whenever the minimum order is larger than the step. The
    // trader has exactly two ways out and both are named, because "rejected"
    // on its own leaves them guessing at a number.
    const maxPartial = round2(total - minLot);
    return {
      kind: "rejected",
      reason:
        maxPartial >= minLot
          ? `that would leave ${remainder} lots behind, which is below the ${minLot} minimum — close the position, or take at most ${maxPartial} lots`
          : `a ${total}-lot position cannot be split: closing any part leaves less than the ${minLot} minimum`,
    };
  }

  return { kind: "partial", volume: round2(wantSteps * lotStep), remainder };
}
