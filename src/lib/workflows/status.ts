import type { WorkflowStatus, WorkflowStatusGate } from "@/lib/workflows/definitions";

export type WorkflowRuntime = {
  hasActiveAccount: boolean;
  hasOpenPositions: boolean;
  hasTradeHistory: boolean;
  hasJournal: boolean;
  hasMemory: boolean;
  hasNews: boolean;
  hasMacro: boolean;
};

export function resolveWorkflowStatus(gate: WorkflowStatusGate, runtime: WorkflowRuntime): WorkflowStatus {
  const acctState: WorkflowStatus = runtime.hasActiveAccount ? "ready" : "needs_account";
  const positionsState: WorkflowStatus = runtime.hasActiveAccount
    ? runtime.hasOpenPositions
      ? "ready"
      : "needs_positions"
    : "needs_account";
  const historyState: WorkflowStatus = runtime.hasActiveAccount
    ? runtime.hasTradeHistory
      ? "ready"
      : "warming"
    : "needs_account";
  const journalState: WorkflowStatus =
    runtime.hasJournal || runtime.hasTradeHistory ? "ready" : "needs_journal";
  const memoryState: WorkflowStatus = runtime.hasMemory ? "ready" : "needs_memory";
  const newsState: WorkflowStatus = runtime.hasNews ? "ready" : "needs_market";
  const macroState: WorkflowStatus = runtime.hasMacro ? "ready" : "needs_market";

  switch (gate) {
    case "account":
      return acctState;
    case "positions":
      return positionsState;
    case "history":
      return historyState;
    case "journal":
      return journalState;
    case "memory":
      return memoryState;
    case "news":
      return newsState;
    case "macro":
      return macroState;
    case "macro_or_news":
      return runtime.hasMacro || runtime.hasNews ? "ready" : "needs_market";
    default:
      return "soon";
  }
}

export const STATUS_LABEL: Record<WorkflowStatus, string> = {
  ready: "Ready",
  needs_account: "Needs MT5",
  needs_positions: "Needs positions",
  needs_market: "Needs market context",
  needs_journal: "Needs journal",
  needs_memory: "Needs memory",
  warming: "Warming",
  soon: "Coming soon",
};

export const STATUS_CLASS: Record<WorkflowStatus, string> = {
  ready: "border-white/[0.10] text-white/90 bg-white/[0.05]",
  needs_account: "border-amber-400/25 text-amber-200/90 bg-amber-400/[0.06]",
  needs_positions: "border-amber-400/25 text-amber-200/90 bg-amber-400/[0.06]",
  needs_market: "border-amber-400/25 text-amber-200/90 bg-amber-400/[0.06]",
  needs_journal: "border-amber-400/25 text-amber-200/90 bg-amber-400/[0.06]",
  needs_memory: "border-amber-400/25 text-amber-200/90 bg-amber-400/[0.06]",
  warming: "border-white/12 text-tos-dim bg-white/[0.03]",
  soon: "border-white/12 text-tos-dim bg-white/[0.03]",
};
