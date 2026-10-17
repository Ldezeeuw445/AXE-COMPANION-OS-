/**
 * The intel quick actions, in one place.
 *
 * This list was written out twice — once in `Composer.tsx` and once in
 * `IntelTerminalComposer.tsx` — with identical contents. Identical today: two
 * literal copies of the same array in two files is how a list starts to drift,
 * and the one nobody edits is the one a user ends up tapping.
 *
 * `requires` names the intel action behind each prompt, so
 * `src/lib/intel/intelSources.ts` can say whether the data exists before
 * anyone promises it. AXE already answers honestly when a feed is not
 * configured, so an unavailable action here is a dead end rather than a lie —
 * but the link is recorded so hiding them is one filter away.
 *
 * Dependency-free so `node --experimental-strip-types` can exercise it.
 */

export type IntelQuickAction = {
  label: string;
  prompt: string;
  /** The key in INTEL_ACTION_SOURCE this prompt leans on. */
  requires: string;
};

export const INTEL_QUICK_ACTIONS: readonly IntelQuickAction[] = [
  {
    label: "Energy vs Gold",
    prompt:
      "How do energy flows correlate with XAUUSD right now? Signal, confidence and feeds.",
    requires: "vesselStream",
  },
  {
    label: "Market Tide",
    prompt: "What's the market tide signal across my watchlist? Net premium and bias.",
    requires: "marketTide",
  },
] as const;
