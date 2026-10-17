import type { ChartActionCommand } from "@/lib/axeChartActions/chartActionTypes";

/**
 * Last-resort intent detection for chart actions.
 *
 * AXE has a proper tool for this (`route_chart_action` in axeService), and the
 * model path is the one that should normally run: it understands phrasing this
 * never will, it can pick the right swing, and — crucially — it leaves a reply
 * in the conversation saying what it drew and why.
 *
 * This exists for the case the model cannot answer at all: no credits, a dead
 * provider, no network. Then a trader asking for a fib should still get a fib
 * rather than silence. It is a safety net, not a shortcut, and the composer
 * only consults it once a turn has failed.
 *
 * Matching is deliberately tolerant — word-based rather than a list of exact
 * sentences. The previous version held sixteen literal phrases for Fibonacci
 * alone and still missed "kun je even een fib zetten".
 */

/** Both languages, since the app is used in Dutch and English interchangeably. */
// Dutch verbs appear as both stem and infinitive ("zet een fib" / "een fib
// zetten"), so the endings are part of the pattern. Leaving them off is what
// made "kun je even een fib zetten" fall through the first time.
const VERB =
  /\b(draw|drawing|plot|put|add|show|mark|teken|tekenen|zet|zetten|maak|maken|plaats|plaatsen|doe|laat\s+zien)\b/;
const REMOVE = /\b(clear|remove|wipe|delete|weg|verwijder|verwijderen|wis|wissen)\b/;

export function detectFallbackChartActionIntent(text: string): ChartActionCommand["type"] | null {
  const normalized = text.toLowerCase();

  // Removal first: "clear the fib" is a clear, not a draw.
  if (REMOVE.test(normalized) && /\b(drawing|drawings|tekening|tekeningen|lijnen|overlays?)\b/.test(normalized)) {
    return "clear_ai_drawings";
  }

  const asksForSomething = VERB.test(normalized);

  // "fibonacci on latest swing" carries no verb at all, but naming where it
  // should go is itself the request. Kept because it was in the old list and
  // people type it.
  const PLACEMENT = /\bop (de )?chart\b|\bon (the )?chart\b|\bon (the )?latest swing\b|\bop (de )?laatste swing\b/;

  if (/\bfib(onacci)?\b/.test(normalized) && (asksForSomething || PLACEMENT.test(normalized))) {
    return "draw_fibonacci";
  }

  if (/\btrend\s?line\b|\btrendlijn\b/.test(normalized) && asksForSomething) {
    return "draw_trendline";
  }

  if (/\b(pdh|pdl|key level|keylevel|niveau|support|resistance|steun|weerstand)\b/.test(normalized) && asksForSomething) {
    return "mark_key_level";
  }

  if (
    /\b(fvg|ifvg|order\s?blocks?|orderblocks?|structure|structuur|rsi|macd|volume|ma|ema|sma|indicator)\b/.test(
      normalized,
    ) &&
    (asksForSomething || /\b(enable|turn on|aanzetten|aan)\b/.test(normalized))
  ) {
    return "add_indicator";
  }

  return null;
}
