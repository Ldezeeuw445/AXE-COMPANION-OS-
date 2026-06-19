/** How long alert auto-trade stays armed after the user taps Arm on Alerts. */
export const ALERT_AUTO_TRADE_ARM_WINDOW_MS = 30 * 60 * 1000;

export function isAlertAutoTradeArmed(armedAt: string | null | undefined): boolean {
  if (!armedAt) return false;
  const t = Date.parse(armedAt);
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < ALERT_AUTO_TRADE_ARM_WINDOW_MS;
}

export function alertAutoTradeArmedRemainingMs(armedAt: string | null | undefined): number {
  if (!armedAt) return 0;
  const t = Date.parse(armedAt);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, ALERT_AUTO_TRADE_ARM_WINDOW_MS - (Date.now() - t));
}
