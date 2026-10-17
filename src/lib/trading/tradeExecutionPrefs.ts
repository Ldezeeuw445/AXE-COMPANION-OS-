import type { AutonomySettings } from "@/lib/trading/autonomy";

export type TradeExecutionPrefs = {
  defaultVolume: number;
  alertAutoTradeEnabled: boolean;
  alertAutoTradeArmed: boolean;
  alertAutoTradeArmedAt: string | null;
  alertSlOffset: number | null;
  alertTpOffset: number | null;
  /** How much AXE may do on its own. See src/lib/trading/autonomy.ts. */
  autonomy: AutonomySettings;
};
