/** Decide a sensible price digits for a broker symbol when broker spec isn't available. */
export function priceDigitsForSymbol(symbol: string): number {
  const s = (symbol ?? "").toUpperCase();
  if (!s) return 5;
  if (s.startsWith("BTC") || s.startsWith("ETH") || s.includes("USDT")) return 2;
  if (s.startsWith("XAU")) return 2;
  if (s.startsWith("XAG")) return 3;
  if (/JPY$/.test(s)) return 3;
  if (/^(US30|US100|US500|GER40|UK100|JPN225|HK50|AUS200|NAS100|SPX500)$/.test(s)) return 1;
  if (/^(WTI|UKOIL|USOIL|XTI|XBR)/.test(s)) return 2;
  return 5;
}

export function formatBrokerPrice(symbol: string, price: number | null | undefined): string {
  if (price == null || Number.isNaN(price)) return "—";
  const digits = priceDigitsForSymbol(symbol);
  return Number(price).toFixed(digits);
}
