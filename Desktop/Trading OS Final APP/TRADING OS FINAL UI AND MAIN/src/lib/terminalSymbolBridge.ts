/**
 * Maps Trading OS watchlist symbols (e.g. EUR/USD, Nasdaq 100) to the chart
 * terminal backend pair keys (e.g. EURUSD, QQQ), and back.
 */

const DISPLAY_TO_TERMINAL: Record<string, string> = {
  'EUR/USD': 'EURUSD',
  'GBP/USD': 'GBPUSD',
  'USD/JPY': 'USDJPY',
  'USD/CHF': 'USDCHF',
  'AUD/USD': 'AUDUSD',
  'USD/CAD': 'USDCAD',
  'NZD/USD': 'NZDUSD',
  'XAU/USD': 'XAUUSD',
  'XAG/USD': 'XAGUSD',
  'XPT/USD': 'XPTUSD',
  XAUUSD: 'XAUUSD',
  XAGUSD: 'XAGUSD',
  XPTUSD: 'XPTUSD',
  'NASDAQ 100': 'QQQ',
  'S&P 500': 'SPY',
  'DOW JONES': 'DIA',
  'BTC/USD': 'BTCUSD',
  'ETH/USD': 'ETHUSD',
  'XRP/USD': 'XRPUSD',
  'SOL/USD': 'SOLUSD',
};

const TERMINAL_TO_DISPLAY: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [d, t] of Object.entries(DISPLAY_TO_TERMINAL)) {
    const key = t.toUpperCase();
    // Prefer slash-style display (e.g. XAU/USD) over self-keys like `XAUUSD: XAUUSD`.
    if (d.includes('/')) out[key] = d;
    else if (!(key in out)) out[key] = d;
  }
  return out;
})();

function normalizeKey(s: string): string {
  return s.trim().toUpperCase();
}

/** Trading OS → terminal API symbol (compact). */
export function toTerminalSymbol(displaySymbol: string): string {
  const raw = displaySymbol.trim();
  if (!raw) return '';
  const k = normalizeKey(raw);
  if (DISPLAY_TO_TERMINAL[raw]) return DISPLAY_TO_TERMINAL[raw];
  if (DISPLAY_TO_TERMINAL[k]) return DISPLAY_TO_TERMINAL[k];
  const slash = k.match(/^([A-Z]{3})\/([A-Z]{3})$/);
  if (slash) return `${slash[1]}${slash[2]}`;
  return k.replace(/\s+/g, '');
}

/** Terminal pair.symbol → Trading OS watchlist style where known. */
export function fromTerminalSymbol(terminalSymbol: string): string {
  const k = terminalSymbol.trim().toUpperCase();
  return TERMINAL_TO_DISPLAY[k] ?? terminalSymbol;
}
