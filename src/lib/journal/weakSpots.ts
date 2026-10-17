/**
 * Weak-spot detection — the step from counting to saying.
 *
 * `computeJournalAnalytics` already tallies labels: how often you were
 * "Impatient", which tag loses most. A tally is not an insight. A trader cannot
 * act on "Impatient: 9"; they can act on "your last nine losers were all closed
 * within four minutes, while your winners average fifty-one — you are cutting
 * the wrong side."
 *
 * Every finding here is derived arithmetically from closed trades. No model
 * call, on purpose: when the OpenAI account ran dry on 2026-10-10 every
 * model-backed insight in the app went silent at once. This keeps working.
 *
 * Dependency-free so it can be exercised with `node --experimental-strip-types`.
 */

export type WeakSpotTrade = {
  id: string;
  symbol: string;
  side: string;
  volume: number;
  pnl: number;
  /** ISO strings. A trade without both times is skipped by timing checks. */
  openTime: string | null;
  closeTime: string | null;
  /** AXE's own label, when it has scored the trade. */
  axeLabel?: string | null;
};

export type WeakSpot = {
  id:
    | "cutting_winners"
    | "fast_losses"
    | "revenge_trading"
    | "size_escalation"
    | "bleeding_symbol"
    | "overtrading_days"
    | "losing_session";
  /** 0-1. Drives ordering and whether this is worth interrupting someone for. */
  severity: number;
  title: string;
  /** What was measured, with the numbers in it. Never vague. */
  evidence: string;
  /** One concrete change. A rule AXE can later check a trade against. */
  proposal: string;
  /** How many trades the finding rests on. Shown so nobody over-reads it. */
  sampleSize: number;
};

/* ── Minimum evidence ─────────────────────────────────────────────
   Thresholds exist so AXE does not lecture someone after four trades.
   Each check also states its own floor; this is the global one.
   ───────────────────────────────────────────────────────────────── */
const MIN_TRADES = 12;
const MIN_PER_GROUP = 4;

function holdMinutes(t: WeakSpotTrade): number | null {
  if (!t.openTime || !t.closeTime) return null;
  const open = Date.parse(t.openTime);
  const close = Date.parse(t.closeTime);
  if (!Number.isFinite(open) || !Number.isFinite(close) || close < open) return null;
  return (close - open) / 60000;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function money(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return `${rounded >= 0 ? "+" : ""}${rounded.toFixed(2)}`;
}

function minutes(n: number): string {
  if (n < 90) return `${Math.round(n)} min`;
  const hours = n / 60;
  return hours < 48 ? `${hours.toFixed(1)} h` : `${(hours / 24).toFixed(1)} d`;
}

/** Clamp a ratio into a 0-1 severity, saturating at `hard`. */
function severityFrom(value: number, soft: number, hard: number): number {
  if (value <= soft) return 0;
  const scaled = (value - soft) / (hard - soft);
  return Math.max(0, Math.min(1, scaled));
}

/* ── The checks ───────────────────────────────────────────────────
   Each returns a finding or null. They read the same trade list and do
   not share state, so adding one cannot break another.
   ───────────────────────────────────────────────────────────────── */

function checkCuttingWinners(trades: WeakSpotTrade[]): WeakSpot | null {
  const winners = trades.filter((t) => t.pnl > 0).map(holdMinutes).filter((m): m is number => m !== null);
  const losers = trades.filter((t) => t.pnl < 0).map(holdMinutes).filter((m): m is number => m !== null);
  if (winners.length < MIN_PER_GROUP || losers.length < MIN_PER_GROUP) return null;

  const winHold = median(winners);
  const loseHold = median(losers);
  if (winHold <= 0) return null;
  const ratio = loseHold / winHold;
  if (ratio < 1.5) return null;

  return {
    id: "cutting_winners",
    severity: severityFrom(ratio, 1.5, 4),
    title: "You hold losers longer than winners",
    evidence: `Your winners run a median of ${minutes(winHold)}; your losers ${minutes(loseHold)} — ${ratio.toFixed(1)}× as long. Measured over ${winners.length} winners and ${losers.length} losers.`,
    proposal: `Set the stop before entry and let it do the deciding, so a loser cannot outlive a winner. A hard "close at ${minutes(winHold * 1.5)}" rule on anything still red would have cut most of these short.`,
    sampleSize: winners.length + losers.length,
  };
}

function checkFastLosses(trades: WeakSpotTrade[]): WeakSpot | null {
  const withHold = trades
    .map((t) => ({ t, hold: holdMinutes(t) }))
    .filter((x): x is { t: WeakSpotTrade; hold: number } => x.hold !== null);
  if (withHold.length < MIN_TRADES) return null;

  const all = withHold.map((x) => x.hold);
  const typical = median(all);
  if (typical <= 0) return null;

  const quick = withHold.filter((x) => x.hold < typical * 0.4);
  if (quick.length < MIN_PER_GROUP) return null;

  const quickPnl = mean(quick.map((x) => x.t.pnl));
  const restPnl = mean(withHold.filter((x) => x.hold >= typical * 0.4).map((x) => x.t.pnl));
  if (quickPnl >= 0 || quickPnl >= restPnl) return null;

  return {
    id: "fast_losses",
    severity: severityFrom(Math.abs(quickPnl - restPnl) / Math.max(1, Math.abs(restPnl) || 1), 0.2, 2),
    title: "Your quickest trades are your worst trades",
    evidence: `${quick.length} trades were closed inside ${minutes(typical * 0.4)} and average ${money(quickPnl)}, against ${money(restPnl)} for the rest. Entering and leaving fast is costing you.`,
    proposal: `Add a minimum hold: once in, no manual close inside ${minutes(typical * 0.4)} unless the stop or target is hit. Let the setup be wrong before you decide it is.`,
    sampleSize: withHold.length,
  };
}

function checkRevengeTrading(trades: WeakSpotTrade[]): WeakSpot | null {
  const ordered = trades
    .filter((t) => t.openTime && t.closeTime)
    .sort((a, b) => Date.parse(a.openTime!) - Date.parse(b.openTime!));
  if (ordered.length < MIN_TRADES) return null;

  const REVENGE_WINDOW_MIN = 15;
  const revenge: WeakSpotTrade[] = [];
  const normal: WeakSpotTrade[] = [];

  for (const trade of ordered) {
    const openedAt = Date.parse(trade.openTime!);
    const precedingLoss = ordered.find((prior) => {
      if (prior.id === trade.id || prior.pnl >= 0 || !prior.closeTime) return false;
      const closedAt = Date.parse(prior.closeTime);
      const gap = (openedAt - closedAt) / 60000;
      return gap >= 0 && gap <= REVENGE_WINDOW_MIN;
    });
    (precedingLoss ? revenge : normal).push(trade);
  }

  if (revenge.length < MIN_PER_GROUP || normal.length < MIN_PER_GROUP) return null;

  const revengePnl = mean(revenge.map((t) => t.pnl));
  const normalPnl = mean(normal.map((t) => t.pnl));
  if (revengePnl >= normalPnl) return null;

  const gap = normalPnl - revengePnl;
  return {
    id: "revenge_trading",
    severity: severityFrom(gap / Math.max(1, Math.abs(normalPnl) || 1), 0.25, 2.5),
    title: "Trades taken straight after a loss perform worse",
    evidence: `${revenge.length} trades opened within ${REVENGE_WINDOW_MIN} minutes of closing a loser average ${money(revengePnl)}. Your other ${normal.length} trades average ${money(normalPnl)}.`,
    proposal: `A ${REVENGE_WINDOW_MIN}-minute cooldown after any loss. AXE can hold the order and hand it back when the window is over — the setup is usually still there, and you are calmer.`,
    sampleSize: ordered.length,
  };
}

function checkSizeEscalation(trades: WeakSpotTrade[]): WeakSpot | null {
  const ordered = trades
    .filter((t) => t.openTime && t.closeTime && t.volume > 0)
    .sort((a, b) => Date.parse(a.openTime!) - Date.parse(b.openTime!));
  if (ordered.length < MIN_TRADES) return null;

  const afterLoss: WeakSpotTrade[] = [];
  const afterOther: WeakSpotTrade[] = [];
  for (let i = 1; i < ordered.length; i += 1) {
    (ordered[i - 1]!.pnl < 0 ? afterLoss : afterOther).push(ordered[i]!);
  }
  if (afterLoss.length < MIN_PER_GROUP || afterOther.length < MIN_PER_GROUP) return null;

  const lossSize = mean(afterLoss.map((t) => t.volume));
  const baseSize = mean(afterOther.map((t) => t.volume));
  if (baseSize <= 0) return null;
  const ratio = lossSize / baseSize;
  if (ratio < 1.25) return null;

  const lossPnl = mean(afterLoss.map((t) => t.pnl));
  return {
    id: "size_escalation",
    severity: severityFrom(ratio, 1.25, 2.5),
    title: "You size up after a loss",
    evidence: `After a losing trade your next position averages ${lossSize.toFixed(2)} lots against ${baseSize.toFixed(2)} normally — ${Math.round((ratio - 1) * 100)}% bigger. Those trades average ${money(lossPnl)}.`,
    proposal: `Fix position size to your risk rule rather than your mood: same percentage of the account whatever the last trade did. AXE can refuse to prepare an order above that size.`,
    sampleSize: ordered.length,
  };
}

function checkBleedingSymbol(trades: WeakSpotTrade[]): WeakSpot | null {
  if (trades.length < MIN_TRADES) return null;

  const bySymbol = new Map<string, WeakSpotTrade[]>();
  for (const t of trades) {
    const key = (t.symbol || "").toUpperCase();
    if (!key) continue;
    const list = bySymbol.get(key);
    if (list) list.push(t);
    else bySymbol.set(key, [t]);
  }

  const total = trades.reduce((a, t) => a + t.pnl, 0);
  let worst: { symbol: string; list: WeakSpotTrade[]; sum: number } | null = null;
  for (const [symbol, list] of bySymbol) {
    if (list.length < MIN_PER_GROUP) continue;
    const sum = list.reduce((a, t) => a + t.pnl, 0);
    if (sum >= 0) continue;
    if (!worst || sum < worst.sum) worst = { symbol, list, sum };
  }
  if (!worst) return null;

  const wins = worst.list.filter((t) => t.pnl > 0).length;
  const winRate = Math.round((wins / worst.list.length) * 100);
  return {
    id: "bleeding_symbol",
    severity: severityFrom(Math.abs(worst.sum) / Math.max(1, Math.abs(total) || 1), 0.3, 1.5),
    title: `${worst.symbol} is costing you money`,
    evidence: `${worst.list.length} trades on ${worst.symbol} total ${money(worst.sum)} with a ${winRate}% win rate.`,
    proposal: `Either stop trading ${worst.symbol} for two weeks and see what your P&L does, or write down the one setup you take there and only take that one. Right now it is your most expensive habit.`,
    sampleSize: worst.list.length,
  };
}

function checkOvertradingDays(trades: WeakSpotTrade[]): WeakSpot | null {
  const dated = trades.filter((t) => t.closeTime);
  if (dated.length < MIN_TRADES) return null;

  const byDay = new Map<string, WeakSpotTrade[]>();
  for (const t of dated) {
    const day = t.closeTime!.slice(0, 10);
    const list = byDay.get(day);
    if (list) list.push(t);
    else byDay.set(day, [t]);
  }
  if (byDay.size < 4) return null;

  const counts = [...byDay.values()].map((l) => l.length);
  const typical = median(counts);
  const threshold = Math.max(typical * 2, typical + 2);

  const busy = [...byDay.values()].filter((l) => l.length >= threshold);
  const calm = [...byDay.values()].filter((l) => l.length < threshold);
  if (busy.length < 2 || calm.length < 2) return null;

  const busyPnl = mean(busy.map((l) => l.reduce((a, t) => a + t.pnl, 0)));
  const calmPnl = mean(calm.map((l) => l.reduce((a, t) => a + t.pnl, 0)));
  if (busyPnl >= calmPnl) return null;

  return {
    id: "overtrading_days",
    severity: severityFrom((calmPnl - busyPnl) / Math.max(1, Math.abs(calmPnl) || 1), 0.3, 2),
    title: "Your busiest days are your worst days",
    evidence: `On ${busy.length} days you took ${Math.round(threshold)}+ trades and averaged ${money(busyPnl)} for the day. Your other ${calm.length} days averaged ${money(calmPnl)}.`,
    proposal: `Cap the day at ${Math.max(1, Math.round(threshold) - 1)} trades. AXE can count them for you and say "that is your last one" before you take the trade that undoes the day.`,
    sampleSize: dated.length,
  };
}

function checkLosingSession(trades: WeakSpotTrade[]): WeakSpot | null {
  const dated = trades.filter((t) => t.openTime);
  if (dated.length < MIN_TRADES) return null;

  // UTC hour buckets, grouped into the sessions a trader actually thinks in.
  const sessions: Array<{ name: string; from: number; to: number }> = [
    { name: "the Asia session", from: 0, to: 7 },
    { name: "the London session", from: 7, to: 13 },
    { name: "the New York session", from: 13, to: 21 },
    { name: "the late/overnight hours", from: 21, to: 24 },
  ];

  let worst: { name: string; list: WeakSpotTrade[]; sum: number } | null = null;
  for (const session of sessions) {
    const list = dated.filter((t) => {
      const hour = new Date(t.openTime!).getUTCHours();
      return hour >= session.from && hour < session.to;
    });
    if (list.length < MIN_PER_GROUP) continue;
    const sum = list.reduce((a, t) => a + t.pnl, 0);
    if (sum >= 0) continue;
    if (!worst || sum < worst.sum) worst = { name: session.name, list, sum };
  }
  if (!worst) return null;

  const total = trades.reduce((a, t) => a + t.pnl, 0);
  return {
    id: "losing_session",
    severity: severityFrom(Math.abs(worst.sum) / Math.max(1, Math.abs(total) || 1), 0.3, 1.5),
    title: `You lose money in ${worst.name}`,
    evidence: `${worst.list.length} trades opened in ${worst.name} total ${money(worst.sum)}.`,
    proposal: `Stop opening positions in ${worst.name} for a month. If your P&L improves, you have found an hour of the day that is not yours — that is a win, not a restriction.`,
    sampleSize: worst.list.length,
  };
}

const CHECKS = [
  checkCuttingWinners,
  checkFastLosses,
  checkRevengeTrading,
  checkSizeEscalation,
  checkBleedingSymbol,
  checkOvertradingDays,
  checkLosingSession,
];

/**
 * Run every check and return findings worth acting on, worst first.
 *
 * Returns an empty list when there is not enough history — silence is the
 * correct answer to "what am I doing wrong?" after six trades.
 */
export function detectWeakSpots(
  trades: WeakSpotTrade[],
  opts: { minSeverity?: number; limit?: number } = {},
): WeakSpot[] {
  const minSeverity = opts.minSeverity ?? 0.2;
  const limit = opts.limit ?? 3;
  if (trades.length < MIN_TRADES) return [];

  const found: WeakSpot[] = [];
  for (const check of CHECKS) {
    const result = check(trades);
    if (result && result.severity >= minSeverity) found.push(result);
  }

  return found.sort((a, b) => b.severity - a.severity).slice(0, limit);
}

/** One sentence for a brief or a push: the single worst thing, or null. */
export function weakSpotHeadline(spots: WeakSpot[]): string | null {
  const top = spots[0];
  if (!top) return null;
  return `${top.title}. ${top.evidence} ${top.proposal}`;
}
