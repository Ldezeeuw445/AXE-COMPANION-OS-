/** Shared shape for core_trading_team_runs rows (Core writes, Companion reads). */
export type TradingTeamRunListItem = {
  id: string;
  created_at: string;
  cycle_id: string;
  status: string;
  mode: string;
  account_id: string | null;
  account_label: string | null;
  companion_broker_account_id: string | null;
  account_guard: string;
  account_guard_reason: string | null;
  verdict: string | null;
  confidence: number | null;
  symbol: string | null;
  side: string | null;
  proposal: Record<string, unknown>;
  execution: Record<string, unknown>;
  decision: Record<string, unknown>;
  error: string | null;
};
