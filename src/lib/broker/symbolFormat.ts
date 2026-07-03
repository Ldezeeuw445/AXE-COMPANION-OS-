const FOREX_CURRENCIES = new Set([
  "EUR",
  "GBP",
  "AUD",
  "NZD",
  "USD",
  "CAD",
  "CHF",
  "JPY",
  "SEK",
  "NOK",
  "DKK",
  "SGD",
  "HKD",
  "ZAR",
  "TRY",
  "MXN",
  "PLN",
  "CZK",
  "HUF",
]);

const KNOWN_EQUITY_CFDS = new Set([
  "AAPL",
  "AMZN",
  "GOOG",
  "GOOGL",
  "JPM",
  "META",
  "MSFT",
  "NVDA",
  "PLTR",
  "SPCX",
  "TSLA",
]);

function normalizeSymbolBase(symbol: string): string {
  return (symbol ?? "")
    .toUpperCase()
    .replace(/^[#.]/, "")
    .replace(/([._-](X|S|M|R|P|C|PRO|RAW|ECN|STD|MICRO|CASH)|[MRZ#])$/i, "");
}

/** Six-letter FX pairs such as EURUSD or USDJPY. */
export function isForexPairSymbol(symbol: string): boolean {
  const base = normalizeSymbolBase(symbol);
  if (base.length !== 6) return false;
  const left = base.slice(0, 3);
  const right = base.slice(3, 6);
  return FOREX_CURRENCIES.has(left) && FOREX_CURRENCIES.has(right);
}

/** Single-name stock CFDs (SPCXUSD, TSLAUSD, …). */
export function isEquityCfdSymbol(symbol: string): boolean {
  const base = normalizeSymbolBase(symbol);
  if (KNOWN_EQUITY_CFDS.has(base)) return true;
  if (/^[A-Z]{2,5}USD$/.test(base) && !isForexPairSymbol(base)) return true;
  return false;
}

/**
 * Contract size per lot — used for `(priceDelta × volume × contractSize)` P&L.
 * Estimates when broker specs are unavailable.
 */
export function contractSizeForSymbol(symbol: string): number {
  const base = normalizeSymbolBase(symbol);
  if (base.startsWith("BTC") || base.startsWith("ETH") || base.includes("USDT")) return 1;
  if (base.startsWith("XAU") || base.startsWith("GOLD")) return 100;
  if (base.startsWith("XAG") || base.startsWith("SILVER")) return 5_000;
  if (isForexPairSymbol(base)) return 100_000;
  if (isEquityCfdSymbol(base)) return 1;
  if (/^(US30|DJ30|DOW|US100|NAS100|NASDAQ|USTEC|NDX|US500|SPX500|SP500|SPX|GER40|UK100|JPN225|HK50|AUS200)$/.test(base)) {
    return 1;
  }
  return 100_000;
}

/** Decide a sensible price digits for a broker symbol when broker spec isn't available. */
export function priceDigitsForSymbol(symbol: string): number {
  const s = (symbol ?? "").toUpperCase();
  if (!s) return 5;
  const base = normalizeSymbolBase(s);
  if (base.startsWith("BTC") || base.startsWith("ETH") || base.includes("USDT")) return 2;
  if (base.startsWith("XAU") || base.startsWith("GOLD")) return 2;
  if (base.startsWith("XAG") || base.startsWith("SILVER")) return 3;
  if (/JPY$/.test(base)) return 3;
  if (/^(US30|DJ30|DOW|US100|NAS100|NASDAQ|USTEC|NDX|US500|SPX500|SP500|SPX|GER40|UK100|JPN225|HK50|AUS200)$/.test(base)) return 1;
  if (isEquityCfdSymbol(base)) return 2;
  if (/^(AAPL|JPM|NVDA|PLTR|TSLA)$/.test(base)) return 2;
  if (/^(WTI|BRENT|UKOIL|USOIL|XTI|XBR)/.test(base)) return 2;
  if (isForexPairSymbol(base)) return /JPY$/.test(base) ? 3 : 5;
  return 5;
}

/**
 * Estimate the $ value of one point move per standard lot for a symbol.
 *
 * For most MT5 brokers:
 *   Forex *USD — 100k units, point=0.00001 → $1/point/lot
 *   XAUUSD     — 100 oz,     point=0.01    → $1/point/lot
 *   BTCUSD     — 1 BTC,      point=0.01    → $0.01/point/lot
 *
 * This is an estimate — exact values depend on broker contract specs.
 */
export function pointValueForSymbol(symbol: string): number {
  const base = normalizeSymbolBase(symbol ?? "");
  if (base.startsWith("BTC") || base.startsWith("ETH") || base.includes("USDT")) return 0.01;
  if (isEquityCfdSymbol(base)) {
    const digits = priceDigitsForSymbol(base);
    const pointSize = Math.pow(10, -digits);
    return pointSize * contractSizeForSymbol(base);
  }
  return 1;
}

/** Estimated SL/TP P&L in account currency (USD) from price levels. */
export function estimateSlTpPnlUsd(
  symbol: string,
  entryPrice: number,
  levelPrice: number,
  volume: number,
  side: "buy" | "sell",
): number {
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) return 0;
  if (!Number.isFinite(levelPrice) || !Number.isFinite(volume) || volume <= 0) return 0;
  const delta = levelPrice - entryPrice;
  const signedDelta = side === "buy" ? delta : -delta;
  return signedDelta * volume * contractSizeForSymbol(symbol);
}

/** MT5-style label: `1 123.69 USD` with sign only for negatives. */
export function formatSlTpPnlUsd(usd: number): string {
  const sign = usd < 0 ? "-" : "";
  const abs = Math.abs(usd);
  const [intPart, decPart] = abs.toFixed(2).split(".");
  const withSpaces = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${sign}${withSpaces}.${decPart} USD`;
}

export function formatBrokerPrice(symbol: string, price: number | null | undefined): string {
  if (price == null || Number.isNaN(price)) return "—";
  const digits = priceDigitsForSymbol(symbol);
  return Number(price).toFixed(digits);
}
