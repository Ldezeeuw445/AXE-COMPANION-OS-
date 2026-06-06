/** Decide a sensible price digits for a broker symbol when broker spec isn't available. */
export function priceDigitsForSymbol(symbol: string): number {
  const s = (symbol ?? "").toUpperCase();
  if (!s) return 5;
  const base = s.replace(/^[#.]/, "").replace(/([._-](X|S|M|R|P|C|PRO|RAW|ECN|STD|MICRO|CASH)|[MRZ#])$/i, "");
  if (base.startsWith("BTC") || base.startsWith("ETH") || base.includes("USDT")) return 2;
  if (base.startsWith("XAU") || base.startsWith("GOLD")) return 2;
  if (base.startsWith("XAG") || base.startsWith("SILVER")) return 3;
  if (/JPY$/.test(base)) return 3;
  if (/^(US30|DJ30|DOW|US100|NAS100|NASDAQ|USTEC|NDX|US500|SPX500|SP500|SPX|GER40|UK100|JPN225|HK50|AUS200)$/.test(base)) return 1;
  if (/^(AAPL|JPM|NVDA|PLTR|TSLA)$/.test(base)) return 2;
  if (/^(WTI|BRENT|UKOIL|USOIL|XTI|XBR)/.test(base)) return 2;
  return 5;
}

/**
 * Estimate the $ value of one point move per standard lot for a symbol.
 *
 * For most MT5 brokers:
 *   Forex *USD — 100k units, point=0.00001 → $1/point/lot
 *   XAUUSD     — 100 oz,     point=0.01    → $1/point/lot
 *   BTCUSD     — 1 BTC,      point=0.01    → $0.01/point/lot
 *   ETHUSD     — 1 ETH,      point=0.01    → $0.01/point/lot
 *
 * This is an estimate — exact values depend on broker contract specs.
 */
export function pointValueForSymbol(symbol: string): number {
  const s = (symbol ?? "").toUpperCase();
  const base = s.replace(/^[#.]/, "").replace(/([._-](X|S|M|R|P|C|PRO|RAW|ECN|STD|MICRO|CASH)|[MRZ#])$/i, "");
  // Crypto: contract size = 1 unit, point = 0.01 → $0.01/point/lot
  if (base.startsWith("BTC") || base.startsWith("ETH") || base.includes("USDT")) return 0.01;
  // Default: ~$1/point/lot (forex, gold, most indices)
  return 1;
}

export function formatBrokerPrice(symbol: string, price: number | null | undefined): string {
  if (price == null || Number.isNaN(price)) return "—";
  const digits = priceDigitsForSymbol(symbol);
  return Number(price).toFixed(digits);
}
