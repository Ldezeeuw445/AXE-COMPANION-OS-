import type { ChartActionMemoryState } from "@/lib/axeChartActions/chartActionTypes";
import type { ChartAnnotation } from "@/components/chart/annotations/types";

export class AxeChartActionMemory {
  private state: ChartActionMemoryState;

  constructor(initial?: Partial<ChartActionMemoryState>) {
    this.state = {
      optIn: initial?.optIn ?? false,
      drawings: initial?.drawings ?? [],
    };
  }

  enable(): ChartActionMemoryState {
    this.state.optIn = true;
    return this.snapshot();
  }

  disable(): ChartActionMemoryState {
    this.state.optIn = false;
    return this.snapshot();
  }

  rememberDrawing(annotation: ChartAnnotation): { stored: boolean; state: ChartActionMemoryState } {
    if (!this.state.optIn) return { stored: false, state: this.snapshot() };
    this.state.drawings = this.state.drawings.filter((item) => item.id !== annotation.id).concat(annotation);
    return { stored: true, state: this.snapshot() };
  }

  snapshot(): ChartActionMemoryState {
    return {
      optIn: this.state.optIn,
      drawings: this.state.drawings.map((annotation) => ({ ...annotation })),
    };
  }
}
