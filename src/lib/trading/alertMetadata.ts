/** Per-alert auto-trade opt-in stored in user_alerts.metadata. */
export function readAlertAutoTradeEnabled(metadata: unknown, defaultEnabled = true): boolean {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return defaultEnabled;
  const v = (metadata as Record<string, unknown>).auto_trade_enabled;
  if (typeof v === "boolean") return v;
  return defaultEnabled;
}
