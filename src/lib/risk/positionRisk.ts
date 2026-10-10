/**
 * Concentration risk across open positions.
 *
 * A trader with three positions usually believes they hold three ideas. Often
 * they hold one idea three times: long XAUUSD, long XAGUSD and short USDJPY is
 * a single bet on a weaker dollar, sized three times over. The account-level
 * risk is the thing nobody is looking at, because every individual ticket looks
 * reasonable.
 *
 * Deliberately arithmetic, not statistical: no rolling-correlation window, no
 * model call. Relationships that hold across regimes (a currency appearing on
 * the same side of several pairs, two metals, two indices) are enough to say
 * something true, and they keep working when the data feed or the model is out.
 *
 * Dependency-free so it can be exercised with `node --experimental-strip-types`.
 */

export type OpenPosition = {
  symbol: string;
  /** "buy" / "sell", or MT5's 0/1 — both are accepted. */
  side: string | number;
  volume: number;
};

export type ConcentrationFinding = {
  id: "same_symbol" | "currency_stack" | "metal_stack" | "index_stack";
  severity: number;
  title: string;
  body: string;
  /** The symbols that make up the cluster. */
  symbols: string[];
};

const METALS = new Set(["XAUUSD", "XAGUSD", "XPTUSD", "XPDUSD", "GOLD", "SILVER"]);
const INDICES = new Set([
  "NAS100", "US100", "US30", "US500", "SPX500", "GER40", "DE40", "UK100",
  "JP225", "HK50", "AUS200", "EU50",
]);

function isLong(side: string | number): boolean {
  if (typeof side === "number") return side === 0; // MT5: 0 = buy, 1 = sell
  return /^(buy|long|0)$/i.test(side.trim());
}

function normalize(symbol: string): string {
  // Strip broker suffixes: XAUUSD.r, EURUSD_i, US30cash
  return symbol
    .toUpperCase()
    .replace(/[._-].*$/, "")
    .replace(/(CASH|SPOT|M|I|R|PRO|ECN)$/i, (m, _g, offset: number) =>
      offset >= 6 ? "" : m,
    )
    .trim();
}

/** Split a six-letter FX pair. Returns null for anything else. */
function fxLegs(symbol: string): { base: string; quote: string } | null {
  if (!/^[A-Z]{6}$/.test(symbol)) return null;
  const base = symbol.slice(0, 3);
  const quote = symbol.slice(3);
  // A metal quoted against USD is six letters too, but it is not an FX pair.
  if (METALS.has(symbol)) return null;
  return { base, quote };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Find clusters where several positions are, in effect, one bet.
 *
 * `totalLots` is deliberately reported: "three positions" is an argument,
 * "2.4 lots pointing the same way" is a fact.
 */
export function detectConcentration(positions: OpenPosition[]): ConcentrationFinding[] {
  const clean = positions
    .map((p) => ({ ...p, symbol: normalize(String(p.symbol ?? "")) }))
    .filter((p) => p.symbol.length > 0 && Number.isFinite(p.volume));
  if (clean.length < 2) return [];

  const findings: ConcentrationFinding[] = [];

  /* ── The same instrument, more than once, the same way ─────────── */
  const bySymbolSide = new Map<string, { symbol: string; lots: number; count: number; long: boolean }>();
  for (const p of clean) {
    const long = isLong(p.side);
    const key = `${p.symbol}:${long ? "L" : "S"}`;
    const entry = bySymbolSide.get(key);
    if (entry) {
      entry.lots += p.volume;
      entry.count += 1;
    } else {
      bySymbolSide.set(key, { symbol: p.symbol, lots: p.volume, count: 1, long });
    }
  }
  for (const entry of bySymbolSide.values()) {
    if (entry.count < 2) continue;
    findings.push({
      id: "same_symbol",
      severity: Math.min(1, 0.4 + (entry.count - 2) * 0.2),
      title: `${entry.count} positions on ${entry.symbol}, all ${entry.long ? "long" : "short"}`,
      body: `That is ${round2(entry.lots)} lots on one idea, split across ${entry.count} tickets. One move against you hits all of them at once — size it as the single position it really is.`,
      symbols: [entry.symbol],
    });
  }

  /* ── One currency, repeated across pairs ───────────────────────── */
  const currencyExposure = new Map<string, { long: string[]; short: string[]; lots: number }>();
  for (const p of clean) {
    const legs = fxLegs(p.symbol);
    if (!legs) continue;
    const long = isLong(p.side);
    const record = (ccy: string, isLongOnCcy: boolean) => {
      const entry = currencyExposure.get(ccy) ?? { long: [], short: [], lots: 0 };
      (isLongOnCcy ? entry.long : entry.short).push(p.symbol);
      entry.lots += p.volume;
      currencyExposure.set(ccy, entry);
    };
    // Long EURUSD is long EUR and short USD.
    record(legs.base, long);
    record(legs.quote, !long);
  }
  for (const [ccy, entry] of currencyExposure) {
    for (const [direction, pairs] of [
      ["long", entry.long],
      ["short", entry.short],
    ] as const) {
      const unique = [...new Set(pairs)];
      if (unique.length < 3) continue;
      findings.push({
        id: "currency_stack",
        severity: Math.min(1, 0.45 + (unique.length - 3) * 0.2),
        title: `You are ${direction} ${ccy} in ${unique.length} pairs`,
        body: `${unique.join(", ")} all put you ${direction} ${ccy}. These are not ${unique.length} trades, they are one view on ${ccy} held ${unique.length} times. A single ${ccy} headline moves every one of them together.`,
        symbols: unique,
      });
    }
  }

  /* ── Metals and indices move as blocks ─────────────────────────── */
  const blockCheck = (
    id: "metal_stack" | "index_stack",
    member: Set<string>,
    name: string,
  ) => {
    const longs = clean.filter((p) => member.has(p.symbol) && isLong(p.side));
    const shorts = clean.filter((p) => member.has(p.symbol) && !isLong(p.side));
    for (const [direction, group] of [
      ["long", longs],
      ["short", shorts],
    ] as const) {
      const unique = [...new Set(group.map((p) => p.symbol))];
      if (unique.length < 2) continue;
      const lots = group.reduce((a, p) => a + p.volume, 0);
      findings.push({
        id,
        severity: Math.min(1, 0.35 + (unique.length - 2) * 0.2),
        title: `${direction === "long" ? "Long" : "Short"} ${unique.length} ${name} at once`,
        body: `${unique.join(" and ")} — ${round2(lots)} lots. ${name} of the same type rarely move independently; treat this as one position of ${round2(lots)} lots, not ${unique.length} separate ones.`,
        symbols: unique,
      });
    }
  };
  blockCheck("metal_stack", METALS, "metals");
  blockCheck("index_stack", INDICES, "indices");

  return findings.sort((a, b) => b.severity - a.severity);
}

/** The single most concentrated cluster, or null. */
export function topConcentration(positions: OpenPosition[]): ConcentrationFinding | null {
  return detectConcentration(positions)[0] ?? null;
}

/* ── Weekend exposure ─────────────────────────────────────────────
   Separate from concentration because it is a clock problem, not a
   correlation one: a prop account that may not hold over the weekend
   needs telling on Friday afternoon, not on Monday morning.
   ───────────────────────────────────────────────────────────────── */

export function weekendExposureWarning(
  now: Date,
  openPositions: number,
  weekendHoldingAllowed: boolean,
): { title: string; body: string } | null {
  if (openPositions < 1) return null;

  // Markets close around 21:00 UTC on Friday. Warn in the last three hours.
  const isFriday = now.getUTCDay() === 5;
  const hour = now.getUTCHours();
  if (!isFriday || hour < 18 || hour >= 21) return null;

  const hoursLeft = Math.max(1, 21 - hour);
  if (!weekendHoldingAllowed) {
    return {
      title: "Weekend rule: positions still open",
      body: `The market closes in about ${hoursLeft}h and this account may not hold over the weekend. You have ${openPositions} position${openPositions === 1 ? "" : "s"} open.`,
    };
  }

  return {
    title: "Weekend gap risk",
    body: `About ${hoursLeft}h until the close, with ${openPositions} position${openPositions === 1 ? "" : "s"} open. Monday can gap straight through a stop — decide now whether you want to carry this.`,
  };
}
