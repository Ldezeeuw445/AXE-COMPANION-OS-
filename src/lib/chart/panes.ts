/**
 * Which indicator panes exist, and how a stored pane order is made safe.
 *
 * This lived inside `ChartScreen.tsx` as a type, a default array and a length
 * check. The length check was the problem: `parsed.length === 3`. It worked
 * exactly as long as there were three panes, and the day a fourth arrived it
 * would have thrown away every order saved by an older build — silently, with
 * the panes simply reverting to default and no way to tell that from a
 * preference that had never been set.
 *
 * It is here rather than there because it is about a stored preference, and
 * because `ChartScreen.tsx` is five thousand lines of React that no check can
 * import. A rule nothing can exercise is a rule that holds until it doesn't.
 */

export type PaneMode = "volume" | "rsi" | "macd" | "stoch" | "adx";

/**
 * Every pane, in the order a trader sees them before they rearrange anything.
 *
 * Volume first because it needs no warm-up, then the oscillators in the order
 * they were added — moving an existing pane here would rearrange the charts of
 * everyone who never touched the order.
 */
export const PANE_MODES: readonly PaneMode[] = ["volume", "rsi", "macd", "stoch", "adx"];

export function isPaneMode(value: unknown): value is PaneMode {
  return typeof value === "string" && (PANE_MODES as readonly string[]).includes(value);
}

/** The localStorage / synced-preference key holding one pane's height. */
export function paneHeightKey(mode: PaneMode): string {
  return `axe.chart.paneHeight.${mode}`;
}

/**
 * A stored pane order, made usable — or null when there is nothing to use.
 *
 * Three rules, and each exists because of a way this can go wrong:
 *
 *  - **Unknown entries are dropped.** A pane removed in a later build leaves
 *    its name in everyone's storage; keeping it would render nothing.
 *  - **Duplicates are dropped.** React keys the panes by mode, so a repeated
 *    entry is two elements claiming one key.
 *  - **Missing panes are appended.** This is what the old length check got
 *    wrong. An order saved before a pane existed is not corrupt, it is just
 *    older: it keeps the arrangement the trader chose and gains the new pane
 *    at the end, where it is out of the way until they move it.
 *
 * Null means "nothing worth restoring" — the caller keeps its default rather
 * than rendering an empty stack.
 */
export function normalizePaneOrder(parsed: unknown): PaneMode[] | null {
  if (!Array.isArray(parsed)) return null;

  const seen = new Set<PaneMode>();
  const order: PaneMode[] = [];
  for (const entry of parsed) {
    if (!isPaneMode(entry) || seen.has(entry)) continue;
    seen.add(entry);
    order.push(entry);
  }
  if (order.length === 0) return null;

  for (const mode of PANE_MODES) {
    if (!seen.has(mode)) order.push(mode);
  }
  return order;
}
