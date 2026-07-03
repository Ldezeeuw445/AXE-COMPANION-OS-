export type TradeExecutionPrefs = {
  defaultVolume: number;
  alertAutoTradeEnabled: boolean;
  alertAutoTradeArmed: boolean;
  alertAutoTradeArmedAt: string | null;
  alertSlOffset: number | null;
  alertTpOffset: number | null;
};
