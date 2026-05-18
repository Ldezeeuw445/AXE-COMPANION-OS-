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

export function formatBrokerPrice(symbol: string, price: number | null | undefined): string {
  if (price == null || Number.isNaN(price)) return "—";
  const digits = priceDigitsForSymbol(symbol);
  return Number(price).toFixed(digits);
}
