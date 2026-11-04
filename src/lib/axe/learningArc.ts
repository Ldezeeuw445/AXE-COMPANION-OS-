/**
 * The arithmetic behind "what AXE knows about how you trade".
 *
 * This file exists because the service that used to do this maths lied, and
 * nobody could see it. A trader with zero closed trades was shown
 * "Top pair: EURUSD · H1", told their preferred session was London, given an
 * alignment score of 50% and — in the morning brief handed to the model as
 * fact — "Key indicators they use: RSI, MACD, MA". None of it was measured.
 * The panel above it said "no fake milestones, only signals you actually sent".
 *
 * So the rules are the same two the learning stage already holds itself to:
 *
 *  1. Nothing is invented. A thing that was not measured comes back empty or
 *     null, never as a plausible default. `null` is a real answer and the UI
 *     must be able to say "not yet".
 *  2. Every number carries what it was counted from, so a trader can check it.
 *     "Top pair: XAUUSD" means nothing; "XAUUSD — 23 of your 61 closed trades"
 *     is something they can go and verify in their own journal.
 *
 * Dependency-free on purpose: the verify suite exercises it directly.
 */

/** One closed trade, reduced to what the arc needs. */
export type ArcTrade = {
  symbol: string | null;
  pnl: number | null;
  openTime: string | null;
  closeTime: string | null;
};

/**
 * Brokers suffix the same instrument a dozen ways — XAUUSD.r, EURUSD.x,
 * US30.cash, GBPUSD-ECN. Strip the suffix so one instrument is one row
 * instead of four.
 *
 * Deliberately conservative: only a trailing `.`/`-`/`_` group of letters or
 * the literal word "cash"/"pro"/"ecn"/"raw"/"micro". A numeric suffix is left
 * alone because it is part of names like "US30" and "SPX500".
 */
export function normaliseSymbol(raw: string | null | undefined): string {
  const s = String(raw ?? "").trim().toUpperCase();
  if (!s) return "";
  return s.replace(/[._-](?:[A-Z]{1,6})$/, "").trim();
}

export type SymbolTally = {
  symbol: string;
  /** Closed trades on this instrument inside the window. */
  trades: number;
  /** Sum of pnl over those trades, in account currency. */
  netPnl: number;
};

/**
 * Rank instruments by how often the trader actually closed a trade on them.
 *
 * The old version mixed closed trades with rows from `chart_live_snapshots` at
 * half weight. That table's primary key is
 * (user_id, account_id, display_symbol, timeframe) — one row per symbol, kept
 * up to date in place. So every charted symbol scored exactly 0.5 whether it
 * had been watched for a minute or a year, and a symbol the trader had never
 * traded could outrank one they traded daily. Charted symbols are a watchlist,
 * not a frequency; they are reported separately and never folded in here.
 */
export function rankTradedSymbols(trades: ArcTrade[]): SymbolTally[] {
  const bySymbol = new Map<string, SymbolTally>();
  for (const t of trades) {
    const symbol = normaliseSymbol(t.symbol);
    if (!symbol) continue;
    const pnl = Number(t.pnl);
    const row = bySymbol.get(symbol) ?? { symbol, trades: 0, netPnl: 0 };
    row.trades += 1;
    if (Number.isFinite(pnl)) row.netPnl += pnl;
    bySymbol.set(symbol, row);
  }
  return [...bySymbol.values()].sort(
    (a, b) => b.trades - a.trades || a.symbol.localeCompare(b.symbol),
  );
}

export type ArcSession = "london" | "newyork" | "asia";

export type SessionSplit = {
  /** The window most of the trader's entries fall in. Null below the minimum sample. */
  session: ArcSession | null;
  counts: Record<ArcSession, number>;
  /** Entries that could be placed in a window at all. */
  classified: number;
  /**
   * Which timestamp the split was read from. Entries are what decide the
   * session you trade — an exit at 19:00 says nothing about a London entry
   * that ran all day — so `open_time` is used whenever the broker gave us one.
   */
  basis: "open" | "close" | "mixed" | "none";
};

/**
 * Fixed-UTC session windows, by entry hour:
 *   07:00–12:00  London before New York joins
 *   12:00–21:00  New York
 *   21:00–07:00  Asia
 *
 * These are approximations and stay fixed through the year — London and New
 * York both shift an hour on their own DST calendars, so a 06:30 UTC summer
 * entry is a London entry that lands in the Asia bucket here. That is a known
 * limit of counting by UTC hour, and it is why `counts` is returned alongside
 * the label instead of only the winner: a 31/29 split is not a preference and
 * the UI can show it as what it is.
 */
export function sessionOfHourUtc(hour: number): ArcSession {
  if (hour >= 7 && hour < 12) return "london";
  if (hour >= 12 && hour < 21) return "newyork";
  return "asia";
}

/** Below this, a "preferred session" is noise. */
export const SESSION_MIN_TRADES = 5;

export function sessionSplit(trades: ArcTrade[]): SessionSplit {
  const counts: Record<ArcSession, number> = { london: 0, newyork: 0, asia: 0 };
  let fromOpen = 0;
  let fromClose = 0;

  for (const t of trades) {
    const stamp = t.openTime ?? t.closeTime;
    if (!stamp) continue;
    const ms = Date.parse(stamp);
    if (!Number.isFinite(ms)) continue;
    counts[sessionOfHourUtc(new Date(ms).getUTCHours())] += 1;
    if (t.openTime) fromOpen += 1;
    else fromClose += 1;
  }

  const classified = fromOpen + fromClose;
  const basis: SessionSplit["basis"] =
    classified === 0 ? "none" : fromClose === 0 ? "open" : fromOpen === 0 ? "close" : "mixed";

  if (classified < SESSION_MIN_TRADES) {
    return { session: null, counts, classified, basis };
  }

  // A tie is not a preference. Ordering the comparison would hand the answer
  // to whichever session happens to be checked first, which is how the old
  // version told every trader with no trades at all that they preferred London.
  const ranked = (Object.keys(counts) as ArcSession[]).sort((a, b) => counts[b] - counts[a]);
  const top = ranked[0]!;
  const second = ranked[1]!;
  if (counts[top] === counts[second]) {
    return { session: null, counts, classified, basis };
  }
  return { session: top, counts, classified, basis };
}

/**
 * Snapshots have stored alignment both as a 0–1 float and as a 0–100 integer
 * over the life of the table, so both are accepted. Anything else — no
 * snapshot, a null, a string — is `null`, which means "not measured". It used
 * to mean 50, printed to the trader as a percentage and handed to the model as
 * "how well AXE has learned this trader's style".
 */
export function normaliseAlignment(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  if (n > 100) return null;
  // 1 is ambiguous (1% or 1.0). Treat it as a full 100 only when the column
  // has never held a percentage — it has, so 1 reads as 1%.
  return n <= 1 && !Number.isInteger(n) ? Math.round(n * 100) : Math.round(n);
}

/**
 * The one line at the top of the cockpit arc panel.
 *
 * Returns null when there is nothing true to say, so the caller shows its own
 * "nothing yet" copy rather than a sentence with a blank in it. The old
 * headline was `Top pair: ${pair} · ${timeframe ?? ""}`, which rendered as
 * "Top pair: EURUSD · " whenever the timeframe was missing.
 */
/**
 * How far back the arc counts, in days.
 *
 * It lives here rather than in the service because `arcHeadline` says the
 * number out loud. It used to be defined in `learningArcService` and written
 * as the literal "90 days" in the sentence below — two places for one fact,
 * and the kind that drifts silently: change the window to 30 and the headline
 * keeps telling the trader 90, with a count that is really over 30. Every
 * number here is supposed to be checkable against their own journal, and that
 * one would not have been.
 */
export const ARC_WINDOW_DAYS = 90;

export function arcHeadline(
  top: SymbolTally | null,
  totalTrades: number,
  watchedCount: number,
  windowDays: number = ARC_WINDOW_DAYS,
): string | null {
  if (top && totalTrades > 0) {
    const share = `${top.trades} of your ${totalTrades} closed trade${totalTrades === 1 ? "" : "s"}`;
    return `Most traded: ${top.symbol} — ${share} in the last ${windowDays} days.`;
  }
  if (watchedCount > 0) {
    return `No closed trades yet. AXE is watching ${watchedCount} symbol${watchedCount === 1 ? "" : "s"} on your charts.`;
  }
  return null;
}

/* ── Chat feedback ──────────────────────────────────────────────────────────
 *
 * The cockpit arc panel prints "N helpful / N off" and a four-week rhythm bar.
 * Both were hardcoded to zero and an empty array in the mapper, so the panel
 * showed 0/0 and the "Thumbs on AXE replies train tone and depth" placeholder
 * for every trader — while the thumbs were being stored the whole time
 * (`messages.metadata.feedback`, plus a row in `assistant_learning_signals`).
 * On the live database at the time of writing that was 28 helpful and 3 off,
 * displayed as zero.
 */

export type FeedbackVote = {
  rating: "up" | "down";
  /** When the thumb was pressed. */
  at: string | null;
};

export type FeedbackWeek = { weekLabel: string; up: number; down: number };

export type FeedbackSummary = {
  up: number;
  down: number;
  /** Oldest to newest, always `weeks` long so the bar chart keeps its shape. */
  weekly: FeedbackWeek[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

function weekLabel(start: Date): string {
  const day = start.getUTCDate();
  const month = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ][start.getUTCMonth()]!;
  return `${day} ${month}`;
}

/**
 * Totals over everything given, plus the last `weeks` seven-day buckets.
 *
 * A vote with no timestamp still counts in the totals — it happened — but
 * cannot be placed on the timeline, so it is left out of the buckets rather
 * than dropped into the current week, which would show activity in a week
 * where none occurred.
 */
export function summariseFeedback(
  votes: FeedbackVote[],
  now: number = Date.now(),
  weeks = 4,
): FeedbackSummary {
  let up = 0;
  let down = 0;
  const buckets: FeedbackWeek[] = [];
  // Bucket boundaries walk back from `now`, so the last bucket is the week
  // ending now rather than a calendar week that may have barely started.
  for (let i = weeks - 1; i >= 0; i -= 1) {
    buckets.push({ weekLabel: weekLabel(new Date(now - (i + 1) * 7 * DAY_MS)), up: 0, down: 0 });
  }

  for (const vote of votes) {
    if (vote.rating === "up") up += 1;
    else if (vote.rating === "down") down += 1;
    else continue;

    if (!vote.at) continue;
    const ms = Date.parse(vote.at);
    if (!Number.isFinite(ms)) continue;
    const ago = now - ms;
    if (ago < 0 || ago >= weeks * 7 * DAY_MS) continue;
    const index = weeks - 1 - Math.floor(ago / (7 * DAY_MS));
    const bucket = buckets[index];
    if (!bucket) continue;
    if (vote.rating === "up") bucket.up += 1;
    else bucket.down += 1;
  }

  return { up, down, weekly: buckets };
}
