/**
 * Turn a queued chart action into something a trader can read a week later.
 *
 * The feed used to render these as the raw action name — "Draw_fibonacci" —
 * with no indication of what was drawn, on what, or why. And it only listed
 * actions still `pending`, so the moment the chart applied one it vanished:
 * the record of what AXE did to your chart erased itself on the way past.
 *
 * For an assistant that is meant to be a second brain, "what did you do and
 * why" is not a nice-to-have. It is the difference between a tool that acted
 * and a colleague who can be questioned.
 *
 * Dependency-free so it can be exercised with `node --experimental-strip-types`.
 */

export type ChartActionSummaryInput = {
  actionType: string;
  symbol: string;
  timeframe: string;
  /** `axe_pending_chart_actions.payload` */
  payload?: Record<string, unknown> | null;
  /** "pending" while the chart has not opened yet, "applied" afterwards. */
  status?: string | null;
};

export type ChartActionSummary = {
  title: string;
  body: string;
};

const ACTION_VERB: Record<string, string> = {
  draw_fibonacci: "Fibonacci",
  draw_trendline: "Trendline",
  mark_key_level: "Key level",
  add_indicator: "Indicators",
  clear_ai_drawings: "Cleared AXE drawings",
};

function readString(payload: Record<string, unknown> | null | undefined, key: string): string | null {
  const v = payload?.[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function readIndicators(payload: Record<string, unknown> | null | undefined): string[] {
  const v = payload?.indicators;
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x).trim()).filter(Boolean);
}

export function chartActionSummary(input: ChartActionSummaryInput): ChartActionSummary {
  const symbol = (input.symbol || "").toUpperCase();
  const timeframe = (input.timeframe || "h1").toUpperCase();
  const action = input.actionType || "draw";
  const what = ACTION_VERB[action] ?? action.replace(/_/g, " ");
  const applied = (input.status ?? "pending").toLowerCase() !== "pending";

  const title = `${what} on ${symbol} ${timeframe}`.trim();

  const parts: string[] = [];

  if (action === "add_indicator") {
    const names = readIndicators(input.payload);
    const enable = input.payload?.enable !== false;
    if (names.length) {
      parts.push(`${enable ? "Turned on" : "Turned off"} ${names.join(", ")}.`);
    }
  }

  const level = readString(input.payload, "level");
  if (level) parts.push(`At ${level}.`);

  // The reason AXE gave. This is the part that makes the item worth keeping.
  const reason = readString(input.payload, "reason");
  if (reason) parts.push(reason.endsWith(".") ? reason : `${reason}.`);

  parts.push(applied ? "Applied to your chart — still adjustable." : "Opens with your chart.");

  return { title, body: parts.join(" ") };
}
