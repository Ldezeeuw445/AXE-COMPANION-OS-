import type { ChartActionType } from "@/lib/axeChartActions/chartActionTypes";

export type QueuedChartAction = {
  id: string;
  type: ChartActionType;
  symbol: string;
  timeframe: string;
  accountId?: string;
  payload?: Record<string, unknown>;
  createdAt: string;
};

const QUEUE_KEY = "axe.chart.pendingActions";

function readQueue(): QueuedChartAction[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueuedChartAction[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(items: QueuedChartAction[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(QUEUE_KEY, JSON.stringify(items.slice(-20)));
}

export function enqueueLocalChartAction(action: Omit<QueuedChartAction, "id" | "createdAt">): QueuedChartAction {
  const entry: QueuedChartAction = {
    ...action,
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  const next = [...readQueue(), entry];
  writeQueue(next);
  return entry;
}

export function consumeLocalChartActions(symbol: string, timeframe: string): QueuedChartAction[] {
  const sym = symbol.trim().toUpperCase();
  const tf = timeframe.trim().toLowerCase();
  const all = readQueue();
  const matching = all.filter(
    (a) => a.symbol.trim().toUpperCase() === sym && a.timeframe.trim().toLowerCase() === tf,
  );
  const remaining = all.filter(
    (a) => !(a.symbol.trim().toUpperCase() === sym && a.timeframe.trim().toLowerCase() === tf),
  );
  writeQueue(remaining);
  return matching;
}

export function buildChartActionHref(
  action: ChartActionType,
  symbol: string,
  timeframe: string,
  extra?: Record<string, string>,
): string {
  const params = new URLSearchParams({
    symbol: symbol.toUpperCase(),
    tf: timeframe.toLowerCase(),
    action,
  });
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      params.set(k, v);
    }
  }
  return `/chart?${params.toString()}`;
}
