import type { ChartActionCommand, ChartActionResult } from "@/lib/axeChartActions/chartActionTypes";

const BLOCKED_EXECUTION_WORDS = [
  "buy",
  "sell",
  "hold",
  "close",
  "execute",
  "place order",
  "market order",
  "liquidate",
];

export function guardChartAction(command: ChartActionCommand): ChartActionResult | null {
  if (!command.id || !command.symbol || !command.timeframe) {
    return blocked(command, "Chart action missing id, symbol, or timeframe.");
  }

  const payloadText = JSON.stringify(command.payload ?? {}).toLowerCase();
  if (BLOCKED_EXECUTION_WORDS.some((word) => payloadText.includes(word))) {
    return blocked(
      command,
      "AXE chart tools are analytical only. They cannot create buy, sell, hold, close, or execution instructions.",
    );
  }

  return null;
}

export function sanitizeChartActionAlertLanguage(message: string): string {
  return message
    .replace(/smaller size or wider stops may be safer/gi, "Review risk settings before making decisions")
    .replace(/you should buy/gi, "review the bullish scenario")
    .replace(/you should sell/gi, "review the bearish scenario")
    .replace(/you should hold/gi, "review your position plan")
    .replace(/close now/gi, "review your invalidation plan");
}

export function createReviewOnlyTradeDraft<T extends Record<string, unknown>>(draft: T): T & {
  confirmationRequired: true;
  executable: false;
} {
  return {
    ...draft,
    confirmationRequired: true,
    executable: false,
  };
}

function blocked(command: ChartActionCommand, message: string): ChartActionResult {
  return {
    id: command.id || "blocked",
    type: command.type,
    status: "blocked",
    message,
  };
}
