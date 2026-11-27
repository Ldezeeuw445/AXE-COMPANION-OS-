/**
 * Which markets are actually open right now, per instrument.
 *
 * The morning brief used to tell a trader to "watch XAUUSD today" on a
 * Saturday (21 Nov 2026: "As the Asian session opens, XAUUSD is trading at
 * 3,532.87 … Monitor XAUUSD for potential reversals") while gold had been
 * closed since Friday 22:00 UTC. The only market-hours code was
 * `isFxMarketOpen` in priceFacts.ts, and the prompt never heard of it.
 *
 * Windows (New York time, which is how the FX/CFD week is defined and what
 * makes the DST shift right without a table):
 *   - crypto: always open.
 *   - fx: Sun 17:00 → Fri 17:00 NY.
 *   - metals / energy / index CFDs: Sun 18:00 → Fri 17:00 NY, with the
 *     daily 17:00–18:00 NY maintenance break Mon–Thu (CME Globex).
 *   - US stocks: Mon–Fri 09:30–16:00 NY, closed on NYSE holidays.
 * Holidays: New Year's Day, Good Friday and Christmas close everything but
 * crypto; US Thanksgiving closes US stocks and halts CME metals/energy/index
 * trading early (13:00 NY), the day after Thanksgiving and 24 Dec close US
 * stocks early (13:00 NY). FX stays open on Thanksgiving but thin.
 *
 * Broker CFD hours differ by a few minutes per broker; every edge here is the
 * conservative one ("closed" sooner rather than later). Dependency-free so the
 * guard tests can run it with node --test.
 */

export type AssetClass = "crypto" | "fx" | "metal" | "energy" | "index" | "stock" | "unknown";

export type ClosedReason = "weekend" | "holiday" | "daily_break" | "outside_hours" | "early_close";

export type MarketStatus = {
  symbol: string;
  assetClass: AssetClass;
  open: boolean;
  reason: ClosedReason | null;
  /** Holiday name when one applies today (open or closed). */
  holiday: string | null;
  /** Thin / abbreviated session — open, but say so. */
  thin: boolean;
  /** Next time this market opens (ISO, UTC), when closed. */
  reopensAt: string | null;
};

const FX_CCY = new Set([
  "USD", "EUR", "GBP", "JPY", "CHF", "AUD", "NZD", "CAD", "SEK", "NOK", "DKK", "PLN",
  "HUF", "CZK", "TRY", "ZAR", "MXN", "SGD", "HKD", "CNH", "ILS",
]);

const CRYPTO_RE = /^(BTC|ETH|SOL|XRP|LTC|ADA|DOGE|BNB|DOT|AVAX|LINK|MATIC|TRX|BCH|XLM|TON|SHIB|PEPE|SUI)(USD|USDT|EUR|USDC)?(\.[A-Z0-9]+)?$/;
const METAL_RE = /^(XAU|XAG|XPT|XPD|GOLD|SILVER)/;
const ENERGY_RE = /^(WTI|BRENT|USOIL|UKOIL|USOUSD|UKOUSD|XTIUSD|XBRUSD|NGAS|NATGAS|XNGUSD|CL|OIL)/;
const INDEX_RE = /^(US30|DJ30|DJI|US500|SPX500|SPX|SP500|US100|NAS100|NDX|USTEC|US2000|RUSSELL|GER40|DE40|DAX|UK100|FTSE|JP225|NIKKEI|FRA40|EU50|STOXX50|AUS200|HK50|VIX|DXY|USDX)/;

/** Strip broker suffixes like ".nx", "-ecn", "m". */
export function canonicalSymbol(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/[/\s]/g, "").replace(/[.\-_][A-Z0-9]+$/, "");
}

export function classifyAsset(symbolRaw: string): AssetClass {
  const s = canonicalSymbol(symbolRaw);
  if (!s) return "unknown";
  if (CRYPTO_RE.test(s)) return "crypto";
  if (METAL_RE.test(s)) return "metal";
  if (ENERGY_RE.test(s)) return "energy";
  if (INDEX_RE.test(s)) return "index";
  if (/^[A-Z]{6}$/.test(s) && FX_CCY.has(s.slice(0, 3)) && FX_CCY.has(s.slice(3))) return "fx";
  if (/^[A-Z]{1,5}$/.test(s)) return "stock";
  return "unknown";
}

// ─── New York clock ──────────────────────────────────────────────────────────

type NyClock = { y: number; m: number; d: number; weekday: number; minutes: number };

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const nyFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function nyClock(now: Date): NyClock {
  const parts = nyFmt.formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  return {
    y: Number(get("year")),
    m: Number(get("month")),
    d: Number(get("day")),
    weekday: WEEKDAYS[get("weekday")] ?? 0,
    minutes: (Number(get("hour")) % 24) * 60 + Number(get("minute")),
  };
}

// ─── Holidays ────────────────────────────────────────────────────────────────

type Holiday = {
  name: string;
  /** Asset classes closed all day. */
  closed: AssetClass[];
  /** Asset classes that close early, at this NY minute-of-day. */
  earlyClose?: { classes: AssetClass[]; atMinutes: number };
  /** Open but thin. */
  thin: AssetClass[];
};

/** Easter Sunday (Gregorian, anonymous algorithm). */
function easter(year: number): { m: number; d: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { m: month, d: day };
}

function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): number {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
}

const ALL_TRADFI: AssetClass[] = ["fx", "metal", "energy", "index", "stock"];

export function holidayFor(y: number, m: number, d: number): Holiday | null {
  if (m === 1 && d === 1) return { name: "New Year's Day", closed: ALL_TRADFI, thin: [] };
  if (m === 12 && d === 25) return { name: "Christmas Day", closed: ALL_TRADFI, thin: [] };
  if (m === 12 && d === 24) {
    return { name: "Christmas Eve", closed: [], earlyClose: { classes: ["stock", "metal", "energy", "index"], atMinutes: 13 * 60 }, thin: ["fx"] };
  }
  if (m === 12 && d === 31) return { name: "New Year's Eve", closed: [], thin: ["fx", "metal", "energy", "index"] };
  const e = easter(y);
  const gf = new Date(Date.UTC(y, e.m - 1, e.d - 2));
  if (gf.getUTCMonth() + 1 === m && gf.getUTCDate() === d) {
    return { name: "Good Friday", closed: ["stock", "metal", "energy", "index"], thin: ["fx"] };
  }
  if (m === 11) {
    const thanks = nthWeekdayOfMonth(y, 11, 4, 4);
    if (d === thanks) {
      return {
        name: "US Thanksgiving",
        closed: ["stock"],
        earlyClose: { classes: ["metal", "energy", "index"], atMinutes: 13 * 60 },
        thin: ["fx"],
      };
    }
    if (d === thanks + 1) {
      return {
        name: "Day after US Thanksgiving",
        closed: [],
        earlyClose: { classes: ["stock"], atMinutes: 13 * 60 },
        thin: ["fx", "metal", "energy", "index"],
      };
    }
  }
  // NYSE-only closures (stocks; CFDs on US indices trade an abbreviated day).
  const nyseOnly: Array<[string, number, number]> = [
    ["Martin Luther King Jr. Day", 1, nthWeekdayOfMonth(y, 1, 1, 3)],
    ["Presidents' Day", 2, nthWeekdayOfMonth(y, 2, 1, 3)],
    ["Juneteenth", 6, 19],
    ["US Independence Day", 7, 4],
    ["Labor Day", 9, nthWeekdayOfMonth(y, 9, 1, 1)],
  ];
  // Memorial Day: last Monday of May.
  const lastMay = new Date(Date.UTC(y, 4, 31)).getUTCDay();
  nyseOnly.push(["Memorial Day", 5, 31 - ((lastMay - 1 + 7) % 7)]);
  // Fixed-date NYSE holidays move to Friday / Monday when they fall on a weekend.
  const observed = (hm: number, hd: number): [number, number] => {
    const wd = new Date(Date.UTC(y, hm - 1, hd)).getUTCDay();
    const shift = wd === 6 ? -1 : wd === 0 ? 1 : 0;
    const o = new Date(Date.UTC(y, hm - 1, hd + shift));
    return [o.getUTCMonth() + 1, o.getUTCDate()];
  };
  for (const [name, hm, hd] of nyseOnly) {
    const [om, od] = name === "Juneteenth" || name === "US Independence Day" ? observed(hm, hd) : [hm, hd];
    if (om === m && od === d) return { name, closed: ["stock"], thin: ["index", "metal", "energy", "fx"] };
  }
  return null;
}

// ─── Open / closed ───────────────────────────────────────────────────────────

const H = 60;

function weeklyOpen(cls: AssetClass, c: NyClock): { open: boolean; reason: ClosedReason | null } {
  if (cls === "crypto") return { open: true, reason: null };
  if (cls === "unknown") return { open: true, reason: null };
  if (cls === "stock") {
    if (c.weekday === 0 || c.weekday === 6) return { open: false, reason: "weekend" };
    const open = c.minutes >= 9 * H + 30 && c.minutes < 16 * H;
    return { open, reason: open ? null : "outside_hours" };
  }
  const sundayOpen = cls === "fx" ? 17 * H : 18 * H;
  if (c.weekday === 6) return { open: false, reason: "weekend" };
  if (c.weekday === 0) return c.minutes >= sundayOpen ? { open: true, reason: null } : { open: false, reason: "weekend" };
  if (c.weekday === 5) return c.minutes < 17 * H ? { open: true, reason: null } : { open: false, reason: "weekend" };
  if (cls !== "fx" && c.minutes >= 17 * H && c.minutes < 18 * H) return { open: false, reason: "daily_break" };
  return { open: true, reason: null };
}

function rawStatus(cls: AssetClass, now: Date): { open: boolean; reason: ClosedReason | null; holiday: string | null; thin: boolean } {
  const c = nyClock(now);
  const base = weeklyOpen(cls, c);
  const hol = cls === "crypto" ? null : holidayFor(c.y, c.m, c.d);
  if (!hol) return { ...base, holiday: null, thin: false };
  if (hol.closed.includes(cls)) {
    // A holiday on a weekday: FX/CFDs reopen at the usual 17:00/18:00 NY roll.
    const reopenRoll = cls === "fx" ? 17 * H : 18 * H;
    if (cls !== "stock" && c.minutes >= reopenRoll && c.weekday !== 5 && c.weekday !== 6) {
      return { ...base, holiday: hol.name, thin: true };
    }
    return { open: false, reason: "holiday", holiday: hol.name, thin: false };
  }
  if (hol.earlyClose?.classes.includes(cls)) {
    const reopenRoll = cls === "stock" ? 24 * H : 18 * H;
    if (c.minutes >= hol.earlyClose.atMinutes && c.minutes < reopenRoll) {
      return { open: false, reason: "early_close", holiday: hol.name, thin: false };
    }
    return { ...base, holiday: hol.name, thin: base.open };
  }
  return { ...base, holiday: hol.name, thin: base.open && hol.thin.includes(cls) };
}

/** First 15-minute step at which the market is open again (searches up to 5 days). */
function nextOpen(cls: AssetClass, now: Date): Date | null {
  const step = 15 * 60 * 1000;
  let t = Math.ceil(now.getTime() / step) * step;
  for (let i = 0; i < 5 * 24 * 4; i += 1, t += step) {
    if (rawStatus(cls, new Date(t)).open) return new Date(t);
  }
  return null;
}

export function marketStatus(symbol: string, now: Date = new Date()): MarketStatus {
  const assetClass = classifyAsset(symbol);
  const s = rawStatus(assetClass, now);
  return {
    symbol: canonicalSymbol(symbol),
    assetClass,
    open: s.open,
    reason: s.reason,
    holiday: s.holiday,
    thin: s.thin,
    reopensAt: s.open ? null : nextOpen(assetClass, now)?.toISOString() ?? null,
  };
}

export type MarketStatusSummary = {
  statuses: MarketStatus[];
  open: string[];
  closed: string[];
  /** Saturday, or Sunday before the FX open, or Friday after the close. */
  tradFiWeekend: boolean;
  holiday: string | null;
};

export function summarizeMarketStatus(symbols: string[], now: Date = new Date()): MarketStatusSummary {
  const seen = new Set<string>();
  const statuses: MarketStatus[] = [];
  for (const raw of symbols) {
    const st = marketStatus(raw, now);
    if (!st.symbol || seen.has(st.symbol)) continue;
    seen.add(st.symbol);
    statuses.push(st);
  }
  const c = nyClock(now);
  const fx = weeklyOpen("fx", c);
  const hol = holidayFor(c.y, c.m, c.d);
  return {
    statuses,
    open: statuses.filter((s) => s.open).map((s) => s.symbol),
    closed: statuses.filter((s) => !s.open).map((s) => s.symbol),
    tradFiWeekend: !fx.open && fx.reason === "weekend",
    holiday: hol?.name ?? null,
  };
}

function fmtLocal(iso: string, timezone: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

const REASON_TEXT: Record<ClosedReason, string> = {
  weekend: "closed for the weekend",
  holiday: "closed for the holiday",
  daily_break: "in its daily maintenance break",
  outside_hours: "outside its trading hours",
  early_close: "closed early for the holiday",
};

/** One line per market, for prompts and for the deterministic MARKET STATUS section. */
export function describeMarketStatus(s: MarketStatus, timezone: string): string {
  if (s.open) {
    const extra = s.holiday ? ` (${s.holiday}${s.thin ? " — thin liquidity" : ""})` : s.thin ? " (thin liquidity)" : "";
    return `${s.symbol}: OPEN${s.assetClass === "crypto" ? " (24/7)" : ""}${extra}`;
  }
  const why = s.reason ? REASON_TEXT[s.reason] : "closed";
  const hol = s.holiday && (s.reason === "holiday" || s.reason === "early_close") ? ` — ${s.holiday}` : "";
  const reopen = s.reopensAt ? `, reopens ${fmtLocal(s.reopensAt, timezone)}` : "";
  return `${s.symbol}: CLOSED (${why}${hol}${reopen})`;
}
