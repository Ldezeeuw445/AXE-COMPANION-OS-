"use client";

/**
 * The orb AXE shows while it works, and the label that says what it is doing.
 *
 * The chat stream already reports a phase and, when tools run, their names —
 * that was thrown away and every wait looked identical. Here the tool decides
 * the animation and the wording, so "pulling your live price" and "drawing on
 * the chart" no longer look like the same shrug.
 */

import { ThinkingOrb, type OrbState, type ThinkingOrbProps } from "thinking-orbs";

/** AXE's own ink — the teal at the middle of the brand gradient. */
export const AXE_ORB_INK = "#3FE6CF";

/** Intel's accent. Not a second orb: a handful of its dots, in gold. */
export const INTEL_ORB_ACCENT = "#d4af37";

/**
 * Per-state tuning, hand-picked in the library's playground.
 *
 * Shared by the composer orb and the one in the thread: the size preset
 * differs (64 vs the 20px inline design), everything else is identical so the
 * two never read as different animations of the same state.
 */
type OrbTuning = Pick<ThinkingOrbProps, "speed" | "dots" | "dotSize" | "opts">;

const BASE: OrbTuning = { speed: 0.7, dots: 2, dotSize: 0.5 };

export const ORB_TUNING: Record<OrbState, OrbTuning> = {
  breathing: { ...BASE, opts: { wobMul: 0.55, bandMul: 6, spin: 0.1 } },
  composing: { ...BASE, opts: { wobMul: 2.5, bandMul: 6 } },
  weaving: { ...BASE },
  connecting: { ...BASE, opts: { thr: 0.84, signals: 12, lineW: 1.2 } },
  listening: { ...BASE },
  solving: { ...BASE },
  searching: { ...BASE, opts: { dimBase: 0.75 } },
  working: { ...BASE, opts: { ghostA: 1, particles: 6 } },
  shaping: { ...BASE },
};

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
/**
 * One orb, optionally with a few gold dots mixed in for Intel.
 *
 * The library takes a single ink colour, so the accent is a second instance
 * with a fraction of the dot count layered on top. Both clocks start when the
 * pair mounts, so they trace the same geometry — the gold reads as a handful
 * of particles inside the same orb rather than a second animation.
 */
export function AxeOrb({
  state,
  size,
  accent,
  label,
}: {
  state: OrbState;
  size: 64 | 32 | 20;
  accent?: "intel";
  label?: string;
}) {
  const tuning = ORB_TUNING[state];
  const base = (
    <ThinkingOrb
      state={state}
      size={size}
      theme="dark"
      color={AXE_ORB_INK}
      {...tuning}
      aria-label={label}
    />
  );
  if (!accent) return base;
  return (
    <span className="relative inline-flex" style={{ width: size, height: size }}>
      {base}
      <ThinkingOrb
        state={state}
        size={size}
        theme="dark"
        color={INTEL_ORB_ACCENT}
        {...tuning}
        dots={(tuning.dots ?? 1) * 0.22}
        style={{ position: "absolute", inset: 0, opacity: 0.85 }}
        aria-hidden
      />
    </span>
  );
}

export function AxeThinkingOrb({
  phase,
  tools,
  size = 20,
  accent,
}: {
  phase: AxeOrbPhase;
  tools?: string[] | null;
  size?: 64 | 32 | 20;
  accent?: "intel";
}) {
  const { state, label } = orbForPhase(phase, tools);
  return (
    <div className="flex items-center gap-2.5 px-1 py-1" aria-live="polite">
      <AxeOrb state={state} size={size} accent={accent} label={`AXE: ${label}`} />
      <span className="text-[12px] text-white/45">{label}…</span>
    </div>
  );
}
