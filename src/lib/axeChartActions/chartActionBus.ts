import type {
  ChartActionCommand,
  ChartActionRenderer,
  ChartActionResult,
} from "@/lib/axeChartActions/chartActionTypes";
import { guardChartAction } from "@/lib/axeChartActions/chartActionGuards";

export class AxeChartActionBus {
  private renderer: ChartActionRenderer;
  private history: ChartActionResult[] = [];

  constructor(renderer: ChartActionRenderer) {
    this.renderer = renderer;
  }

  dispatch(command: ChartActionCommand): ChartActionResult {
    const blocked = guardChartAction(command);
    if (blocked) {
      this.history.push(blocked);
      return blocked;
    }

    const result = this.render(command);
    this.history.push(result);
    return result;
  }

  getHistory(): ChartActionResult[] {
    return [...this.history];
  }

  private render(command: ChartActionCommand): ChartActionResult {
    switch (command.type) {
      case "draw_fibonacci":
        return this.renderer.drawFibonacci(command);
      case "draw_trendline":
        return this.renderer.drawTrendline(command);
      case "mark_key_level":
        return this.renderer.markKeyLevel(command);
      case "add_indicator":
        return this.renderer.addIndicator(command);
      case "clear_ai_drawings":
        return this.renderer.clearAiDrawings(command);
    }
  }
}

export function detectFallbackChartActionIntent(text: string): ChartActionCommand["type"] | null {
  const normalized = text.toLowerCase();
  if (
    normalized.includes("draw fib") ||
    normalized.includes("draw fibonacci") ||
    normalized.includes("put fib") ||
    normalized.includes("zet fib") ||
    normalized.includes("fib op de chart") ||
    normalized.includes("fib op chart") ||
    normalized.includes("fib tekenen") ||
    normalized.includes("fibonacci tekenen") ||
    normalized.includes("fibonacci op de chart") ||
    normalized.includes("fibonacci op chart") ||
    normalized.includes("fib die je net zei") ||
    normalized.includes("fib die je zei") ||
    normalized.includes("maak de fib") ||
    normalized.includes("maak fib") ||
    normalized.includes("fibonacci on latest swing") ||
    normalized.includes("fib on latest swing")
  ) {
    return "draw_fibonacci";
  }
  if (
    normalized.includes("draw trendline") ||
    normalized.includes("draw trend line") ||
    normalized.includes("teken trendline") ||
    normalized.includes("trendline tekenen") ||
    normalized.includes("trendline op de chart")
  ) {
    return "draw_trendline";
  }
  if (
    normalized.includes("clear drawings") ||
    normalized.includes("clear ai drawings") ||
    normalized.includes("remove drawings")
  ) {
    return "clear_ai_drawings";
  }
  return null;
}
