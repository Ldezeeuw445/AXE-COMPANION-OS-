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
