import type { TradesJournalContext } from "@/types/context";

type AccountLike = {
  id: string;
  label: string;
  mt5Server: string | null;
  providerStatus: string | null;
  lastSyncAt: string | null;
  symbolMap: Record<string, string>;
  metadata?: Record<string, unknown>;
};

function accountSummaryBroker(metadata: Record<string, unknown> | undefined): string | null {
  const summary = metadata?.accountSummary;
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) return null;
  const broker = (summary as { broker?: unknown }).broker;
  const server = (summary as { server?: unknown }).server;
  if (typeof broker === "string" && broker.trim()) return broker.trim();
  if (typeof server === "string" && server.trim()) return server.trim();
  return null;
}

function isDemoAccount(label: string, server: string | null): boolean {
  const hay = `${label} ${server ?? ""}`.toLowerCase();
  return /demo|ftmo|funded|challenge|prop|evaluation|trial/.test(hay);
}

/** Compact persona block for the active broker account — persisted per account in Supabase. */
export function buildAccountPersona(
  account: AccountLike,
  trades: Pick<TradesJournalContext, "recentTrades" | "recurringLabels" | "riskPatterns" | "analytics">,
): string {
  const broker = accountSummaryBroker(account.metadata);
  const mapped = Object.keys(account.symbolMap);
  const symbolSample = mapped.slice(0, 10).join(", ");
  const recentSymbols = [
    ...new Set(trades.recentTrades.slice(0, 12).map((t) => t.symbol.toUpperCase())),
  ].slice(0, 6);
  const patterns = [...trades.recurringLabels, ...trades.riskPatterns].slice(0, 4);
  const demo = isDemoAccount(account.label, account.mt5Server);
  const status = (account.providerStatus ?? "unknown").toLowerCase();

  const lines = [
    `Account "${account.label}"${broker ? ` (${broker})` : ""}${account.mt5Server ? ` · server ${account.mt5Server}` : ""}.`,
    demo
      ? "Type: evaluation/demo-style — emphasize rule compliance, risk caps, and consistency over aggression."
      : "Type: live/production — emphasize capital preservation and execution quality.",
    `Connection: ${status}; last sync ${account.lastSyncAt ? account.lastSyncAt.slice(0, 16) : "never"}.`,
    mapped.length > 0
      ? `Broker symbols mapped (${mapped.length}): ${symbolSample}${mapped.length > 10 ? "…" : ""}.`
      : "Broker symbol map empty — sync MT5 before symbol-specific live analysis.",
  ];

  if (recentSymbols.length > 0) {
    lines.push(`Recent symbols traded: ${recentSymbols.join(", ")}.`);
  }
  if (trades.analytics.totalTrades > 0) {
    lines.push(
      `Recent ledger: ${trades.analytics.totalTrades} trades, P/L ${trades.analytics.totalPnl.toFixed(2)}, W/L ${trades.analytics.wins}/${trades.analytics.losses}.`,
    );
  }
  if (patterns.length > 0) {
    lines.push(`Behavioral patterns on this account: ${patterns.join(" | ")}.`);
  }

  lines.push(
    "Speak to this account by name when confirming setups, sync status, or journal feedback.",
  );

  return lines.join(" ");
}

export const BROKER_ACCOUNT_MEMORY_SCOPE = "broker_account";
