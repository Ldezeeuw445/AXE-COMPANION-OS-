/**
 * Playbook recognition — what this trader is actually good at, and when.
 *
 * `weakSpots.ts` is the half of this that already existed: it finds what is
 * going wrong and says stop. Useful, and only ever a brake. Luka asked for the
 * other half — AXE that comes to you with something out of its own accord,
 * build-list item 3.4: *"playbook-herkenning uit trades → 'jij traadt London
 * open breakouts; vandaag is de range te smal'"*.
 *
 * So this finds the opposite: the conditions under which the trader's own
 * closed trades actually make money, named back to them, with the trades
 * behind it. Their edge, measured — not a trade idea.
 *
 * That last distinction is the whole design and it is not pedantry:
 *
 *   "Your London XAUUSD longs: 14 trades, 64% won, +18.40 each on average"
 *
 * is a statement about the trader, checkable against their own journal. A
 * statement about the market — "XAUUSD looks long here" — is a signal, AXE
 * has no business issuing one, and nothing in this file produces one. Every
 * sentence here is about trades that already closed.
 *
 * Two rules keep it from being astrology:
 *
 *  1. A bucket needs enough trades. Win rate on five trades is noise, and
 *     noise named confidently is worse than silence.
 *  2. A bucket must beat the trader's **own** baseline by a margin. Someone
 *     whose whole account averages +20 a trade has no "edge" in a slice that
 *     also averages +20 — that is just a slice. Without this, every trader
 *     with a profitable account would be told their best random subset is a
 *     playbook.
 *
 * Arithmetic only, no model call — deliberately, like weakSpots: when the
 * OpenAI account ran dry on 2026-10-10 every model-backed insight in the app
 * went silent at once. This keeps working.
 *
 * Dependency-free so the verify suite can exercise it directly.
 */

export type EdgeTrade = {
  id: string;
  symbol: string;
  /** "buy" / "sell", however the broker spells it. */
  side: string;
  pnl: number;
  /** ISO. The entry is what decides the session; a trade without one is skipped. */
  openTime: string | null;
};

export type EdgeSession = "london" | "newyork" | "asia";
export type EdgeDirection = "long" | "short";

export type PlaybookEdge = {
  /** Stable, so a notice can be keyed on it without repeating daily. */
  id: string;
  symbol: string;
  session: EdgeSession;
  direction: EdgeDirection;
  trades: number;
  wins: number;
  /** Share of trades that closed positive, 0-1. */
  winRate: number;
  /** Average P/L per trade in account currency. */
  perTrade: number;
  /** Sum over the bucket. */
  netPnl: number;
  /** The trader's own average over every trade counted, for comparison. */
  baselinePerTrade: number;
  /** What was measured, with the numbers in it. Never vague. */
  evidence: string;
  /** 0-1, for ordering and for deciding whether to interrupt anyone. */
  strength: number;
};

/* ── Minimum evidence ─────────────────────────────────────────────
   A trader should never be told they have a playbook on the strength of a
   good week. These floors are the difference between a measurement and a
   compliment.
   ───────────────────────────────────────────────────────────────── */

/** Trades in the bucket. Below this, nothing is claimed about it. */
export const MIN_EDGE_TRADES = 8;
/** Closed trades overall, before any bucket is looked at. */
export const MIN_TOTAL_TRADES = 20;
/**
 * How much better than the trader's own average a bucket has to be.
 *
 * Expressed as a multiple of their baseline rather than a fixed amount,
 * because "+15 a trade" means something different on a $5k account than on a
 * $200k one. 1.5x is deliberately coarse: a bucket has to be clearly, not
 * marginally, their better ground.
 */
export const EDGE_MARGIN = 1.5;
/** A bucket that loses money is weakSpots' job, not this file's. */
const MIN_PER_TRADE = 0;

/**
 * Session windows by entry hour UTC, the same boundaries the chart draws:
 * 07–12 London before New York joins, 12–21 New York, 21–07 Asia.
 *
 * Fixed UTC, so a summer 06:30 London entry lands in the Asia bucket. That
 * limit is stated in `@/lib/chart/sessionDay` too, and it is why the evidence
 * sentence always names the trade count — a trader who disagrees with the
 * label can go and look at which trades were counted.
 */
function sessionOf(openTime: string | null): EdgeSession | null {
  if (!openTime) return null;
  const ms = Date.parse(openTime);
  if (!Number.isFinite(ms)) return null;
  const hour = new Date(ms).getUTCHours();
  if (hour >= 7 && hour < 12) return "london";
  if (hour >= 12 && hour < 21) return "newyork";
  return "asia";
}

function directionOf(side: string): EdgeDirection | null {
  const s = String(side ?? "").trim().toLowerCase();
  if (s.startsWith("buy") || s === "long" || s === "0") return "long";
  if (s.startsWith("sell") || s === "short" || s === "1") return "short";
  return null;
}

export const SESSION_LABELS: Record<EdgeSession, string> = {
  london: "London",
  newyork: "New York",
  asia: "Asia",
};

function money(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return rounded >= 0 ? `+${rounded.toFixed(2)}` : rounded.toFixed(2);
}

/** Strip a broker suffix so one instrument is one bucket, not four. */
function normaliseSymbol(raw: string): string {
  const s = String(raw ?? "").trim().toUpperCase();
  return s.replace(/[._-](?:[A-Z]{1,6})$/, "").trim();
}

/**
 * 0-1 from how far past the margin a bucket sits, tempered by sample size.
 *
 * Both matter and neither alone is enough: twenty trades at a hair above
 * baseline is not an edge, and three spectacular trades are not either. The
 * sample term saturates at 25 trades, past which more data stops changing the
 * answer much.
 */
function strengthOf(perTrade: number, baseline: number, trades: number): number {
  const base = Math.abs(baseline) || 1;
  const ratio = perTrade / base;
  const excess = Math.max(0, Math.min(1, (ratio - EDGE_MARGIN) / 2));
  const sample = Math.max(0, Math.min(1, (trades - MIN_EDGE_TRADES) / (25 - MIN_EDGE_TRADES)));
  // Geometric mean, so a near-zero on either side keeps the whole thing low
  // rather than being averaged away by a high other side.
  return Math.round(Math.sqrt(excess * sample) * 100) / 100;
}

export function edgeId(symbol: string, session: EdgeSession, direction: EdgeDirection): string {
  return `${symbol}:${session}:${direction}`;
}

/**
 * The buckets where this trader actually makes their money.
 *
 * Ordered strongest first. Empty is the normal answer for most accounts and
 * must be rendered as "nothing yet", never padded — an invented playbook is
 * the single most expensive thing this file could produce, because a trader
 * would act on it.
 */
export function derivePlaybookEdges(trades: EdgeTrade[]): PlaybookEdge[] {
  const usable = trades.filter(
    (t) => Number.isFinite(Number(t.pnl)) && sessionOf(t.openTime) !== null && directionOf(t.side) !== null,
  );
  if (usable.length < MIN_TOTAL_TRADES) return [];

  const baselinePerTrade =
    usable.reduce((sum, t) => sum + Number(t.pnl), 0) / usable.length;

  type Bucket = { symbol: string; session: EdgeSession; direction: EdgeDirection; pnls: number[] };
  const buckets = new Map<string, Bucket>();

  for (const t of usable) {
    const symbol = normaliseSymbol(t.symbol);
    const session = sessionOf(t.openTime)!;
    const direction = directionOf(t.side)!;
    if (!symbol) continue;
    const id = edgeId(symbol, session, direction);
    const bucket = buckets.get(id) ?? { symbol, session, direction, pnls: [] };
    bucket.pnls.push(Number(t.pnl));
    buckets.set(id, bucket);
  }

  const edges: PlaybookEdge[] = [];
  for (const [id, bucket] of buckets) {
    const trades = bucket.pnls.length;
    if (trades < MIN_EDGE_TRADES) continue;

    const netPnl = bucket.pnls.reduce((a, b) => a + b, 0);
    const perTrade = netPnl / trades;
    if (perTrade <= MIN_PER_TRADE) continue;

    // The baseline comparison. A trader whose whole account averages +20 has
    // no edge in a slice that also averages +20.
    const base = Math.abs(baselinePerTrade) || 1;
    if (perTrade < base * EDGE_MARGIN) continue;

    const wins = bucket.pnls.filter((p) => p > 0).length;
    const label = SESSION_LABELS[bucket.session];
    const dir = bucket.direction === "long" ? "longs" : "shorts";

    edges.push({
      id,
      symbol: bucket.symbol,
      session: bucket.session,
      direction: bucket.direction,
      trades,
      wins,
      winRate: wins / trades,
      perTrade,
      netPnl,
      baselinePerTrade,
      evidence:
        `${trades} ${label} ${bucket.symbol} ${dir}: ${wins} of ${trades} won, ` +
        `${money(perTrade)} each on average against ${money(baselinePerTrade)} across everything you trade.`,
      strength: strengthOf(perTrade, baselinePerTrade, trades),
    });
  }

  return edges.sort((a, b) => b.strength - a.strength || b.trades - a.trades);
}

/**
 * The edge whose session is open right now, if any.
 *
 * This is the only place time enters. It answers "is the trader standing in
 * their own best window", which is a fact about their calendar and their
 * history — not a view on the market.
 *
 * `watchedSymbols` is their saved chart list (`user_chart_preferences`): an
 * edge on an instrument they are not even looking at today is not worth a
 * notification. Pass an empty list to skip that filter.
 */
export function edgeOpenNow(
  edges: PlaybookEdge[],
  now: Date,
  watchedSymbols: string[] = [],
  minStrength = 0.25,
): PlaybookEdge | null {
  const session = sessionOf(now.toISOString());
  if (!session) return null;
  const watching = new Set(watchedSymbols.map((s) => normaliseSymbol(s)));
  for (const edge of edges) {
    if (edge.session !== session) continue;
    if (edge.strength < minStrength) continue;
    if (watching.size > 0 && !watching.has(edge.symbol)) continue;
    return edge;
  }
  return null;
}

/**
 * How the trader hears it.
 *
 * Phrased as their own record, in the past tense, every time. "This is where
 * you have made money" is checkable; "this is a good time to buy" is a signal
 * wearing a statistic as a disguise.
 */
export function edgeNoticeParts(edge: PlaybookEdge): {
  title: string;
  what: string;
  soWhat: string;
} {
  const label = SESSION_LABELS[edge.session];
  const dir = edge.direction === "long" ? "long" : "short";
  return {
    title: `${label} is your ${edge.symbol} window`,
    what: edge.evidence,
    soWhat:
      `${label} is open now. This is your own record going ${dir} here, not a view on today's market — ` +
      `check whether the setup you normally take is actually there.`,
  };
}
