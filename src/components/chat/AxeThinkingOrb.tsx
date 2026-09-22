"use client";

/**
 * The orb AXE shows while it works, and the label that says what it is doing.
 *
 * The chat stream already reports a phase and, when tools run, their names —
 * that was thrown away and every wait looked identical. Here the tool decides
 * the animation and the wording, so "pulling your live price" and "drawing on
 * the chart" no longer look like the same shrug.
 */

import { ThinkingOrb, type OrbState } from "thinking-orbs";

/** Tool name → what the trader should understand is happening. */
const TOOL_LABELS: Record<string, { state: OrbState; label: string }> = {
  get_live_price: { state: "searching", label: "Reading the broker price" },
  get_economic_calendar: { state: "searching", label: "Checking the calendar" },
  get_news_headlines: { state: "searching", label: "Scanning headlines" },
  get_smart_money_intel: { state: "connecting", label: "Pulling smart-money flow" },
  calculate_fibonacci: { state: "solving", label: "Running the levels" },
  analyze_orderblock: { state: "solving", label: "Reading order blocks" },
  analyze_pdh_pdl: { state: "solving", label: "Marking PDH / PDL" },
  calculate_trendline: { state: "solving", label: "Fitting the trendline" },
  create_alert: { state: "shaping", label: "Setting your alert" },
  list_alerts: { state: "searching", label: "Checking your alerts" },
  track_commitment: { state: "shaping", label: "Noting that down" },
  save_note: { state: "shaping", label: "Saving to your journal" },
  update_alert: { state: "shaping", label: "Updating your alert" },
  route_chart_action: { state: "weaving", label: "Drawing on the chart" },
  prepare_execution_request: { state: "shaping", label: "Drafting the ticket" },
  read_journal: { state: "searching", label: "Reading your journal" },
  auto_journal_trades: { state: "weaving", label: "Journalling your trades" },
  navigate_to: { state: "shaping", label: "Opening that screen" },
};

export type AxeOrbPhase = string | null;

export function orbForPhase(
  phase: AxeOrbPhase,
  tools?: string[] | null,
): { state: OrbState; label: string } {
  if (phase === "tools") {
    const known = (tools ?? []).map((t) => TOOL_LABELS[t]).filter(Boolean);
    if (known.length === 1) return known[0];
    if (known.length > 1) return { state: "connecting", label: "Gathering your context" };
    return { state: "searching", label: "Fetching data" };
  }
  if (phase === "responding") return { state: "composing", label: "Writing" };
  return { state: "working", label: "Thinking" };
}

/**
 * The waiting state in the chat thread: orb at avatar scale with the label
 * beside it. `size` is a tuned preset in this library, not a scale factor —
 * 64 for the thread, 20 inline.
 */
export function AxeThinkingOrb({
  phase,
  tools,
  size = 20,
}: {
  phase: AxeOrbPhase;
  tools?: string[] | null;
  size?: 64 | 32 | 20;
}) {
  const { state, label } = orbForPhase(phase, tools);
  return (
    <div className="flex items-center gap-2.5 px-1 py-1" aria-live="polite">
      <ThinkingOrb state={state} size={size} aria-label={`AXE: ${label}`} />
      <span className="text-[12px] text-white/45">{label}…</span>
    </div>
  );
}
