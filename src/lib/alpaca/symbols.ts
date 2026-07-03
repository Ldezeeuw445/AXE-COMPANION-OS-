/** US equity tickers AXE supports on Alpaca paper/live. */
const ALPACA_EQUITY = new Set([
  "AAPL",
  "AMZN",
  "GOOG",
  "GOOGL",
  "JPM",
  "META",
  "MSFT",
  "NVDA",
  "PLTR",
  "SPY",
  "TSLA",
]);

/**
 * Map AXE display / MT5-style symbols to Alpaca tickers.
 * SPCXUSD → not on Alpaca (private); falls back to demo synthetic data.
 */
export function toAlpacaSymbol(symbol: string): string | null {
  const raw = (symbol ?? "").toUpperCase().trim();
  if (!raw) return null;

  const base = raw
    .replace(/^[#.]/, "")
    .replace(/([._-](X|S|M|R|P|C|PRO|RAW|ECN|STD|MICRO|CASH)|[MRZ#])$/i, "")
    .replace(/USD$/, "");

  if (ALPACA_EQUITY.has(base)) return base;
  if (ALPACA_EQUITY.has(raw)) return raw;
  if (/^[A-Z]{1,5}$/.test(base) && !base.endsWith("USD")) return base;
  return null;
}

export function isAlpacaSupportedSymbol(symbol: string): boolean {
  return toAlpacaSymbol(symbol) != null;
}

export function axeSymbolFromAlpaca(ticker: string): string {
  return ticker.toUpperCase();
}
