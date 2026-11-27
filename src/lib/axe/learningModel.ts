/**
 * AXE learning model v2 — the honest, explainable "how well does AXE know you".
 *
 * Why this exists (audit 27-11-2026): the old alignment score was
 *   mean(AXE's own per-trade LLM scores) + a volume bonus of up to +12 points
 * and then run through a smoother that moved at most 7 points per snapshot.
 * The volume bonus saturates after a handful of chats, the "new evidence"
 * count that loosened the smoother was capped by query limits, and the brief
 * glued "AXE knows your style well" onto whatever number came out. The result
 * sat at 62% for four weeks while nothing about it could be explained.
 *
 * This model:
 *  - is built from five named components, each with its own sample size,
 *    minimum sample, confidence and a sentence that says what it counted;
 *  - returns `score: null` with "still learning, X of Y data points" until
 *    there is enough to say anything (never a default, never a constant);
 *  - has no smoothing and no volume bonus: the same data gives the same number;
 *  - can be recomputed as of any past date, so the history graph is a real
 *    reconstruction and the weekly change log is a diff of two real states;
 *  - honours the trader's own corrections, resets and hides.
 *
 * Dependency-free on purpose: unit tests and the verify suite run it directly,
 * and Trading OS can mirror the types.
 */

export const LEARNING_MODEL_VERSION = 2;
export const LEARNING_WINDOW_DAYS = 90;
/** Data points (closed trades + rated AXE replies) before an overall score exists. */
export const LEARNING_REQUIRED_POINTS = 20;
/** Components that must have enough data before an overall score exists. */
export const LEARNING_REQUIRED_COMPONENTS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

/* ── Inputs ─────────────────────────────────────────────────────────────── */

export type LearningTrade = {
  id: string;
  accountId: string | null;
  symbol: string | null;
  openTime: string | null;
  closeTime: string | null;
  pnl: number | null;
};

/** AXE's own per-trade review (trade_journal_labels.alignment_score, 0–100). */
export type LearningLabel = {
  tradeId: string;
  axeScore: number | null;
};

/** A thumb on an AXE reply, one per message (latest wins). */
export type LearningVote = {
  messageId: string | null;
  rating: "up" | "down";
  at: string | null;
};

export type LearningFamily = "setup" | "risk" | "timing" | "focus" | "feedback";

export type LearningOverride = {
  /** A family ("timing"), a single item key ("instrument:XAUUSD"), or "all". */
  itemKey: string;
  action: "correct" | "reset" | "hide";
  /** For `correct`: "london" | "newyork" | "asia" for timing, "XAUUSD,BTCUSD" for focus. */
  value?: string | null;
  createdAt: string;
};

export type LearningInput = {
  trades: LearningTrade[];
  labels: LearningLabel[];
  votes: LearningVote[];
  /** What the trader told AXE they trade (watchlist / settings). */
  declaredSymbols: string[];
  overrides: LearningOverride[];
  now: number;
  windowDays?: number;
};

/* ── Outputs ────────────────────────────────────────────────────────────── */

export type LearningConfidence = "insufficient" | "low" | "medium" | "high";

export type LearningComponent = {
  key: LearningFamily;
  label: string;
  weight: number;
  /** 0–100, or null while below `minSample`. */
  score: number | null;
  sample: number;
  minSample: number;
  confidence: LearningConfidence;
  /** One sentence, in numbers, of what was counted. */
  explanation: string;
  /** Shown when score is null: what AXE still needs. */
  needs: string | null;
  /** The trader reset or corrected this family. */
  userAdjusted: boolean;
};

export type LearnedItem = {
  key: string;
  family: LearningFamily;
  label: string;
  value: string;
  detail: string;
  sample: number;
  confidence: LearningConfidence;
  status: "learned" | "corrected";
  /** What AXE measured, kept next to a correction so both stay visible. */
  learnedValue?: string;
};

export type UnknownItem = {
  key: string;
  family: LearningFamily;
  label: string;
  have: number;
  need: number;
  text: string;
};

export type LearningState = {
  version: number;
  asOf: string;
  windowDays: number;
  status: "learning" | "scored";
  /** 0–100, null while status is "learning". */
  score: number | null;
  confidence: LearningConfidence;
  dataPoints: number;
  requiredPoints: number;
  readyComponents: number;
  requiredComponents: number;
  headline: string;
  components: LearningComponent[];
  items: LearnedItem[];
  unknowns: UnknownItem[];
  counts: { trades: number; labelled: number; votes: number; accounts: number };
};

export type LearningChange = {
  kind: "new" | "strengthened" | "weakened" | "updated" | "lost" | "score";
  key: string;
  text: string;
  evidence: { trades: number; votes: number; symbols: string[] };
};

export type LearningHistoryPoint = {
  at: string;
  score: number | null;
  dataPoints: number;
  components: Partial<Record<LearningFamily, number | null>>;
};

/* ── Helpers ────────────────────────────────────────────────────────────── */

export function normaliseLearningSymbol(raw: string | null | undefined): string {
  const s = String(raw ?? "").trim().toUpperCase();
  if (!s) return "";
  return s.replace(/[._-](?:[A-Z]{1,6})$/, "").replace(/\//g, "").trim();
}

export type LearningSession = "london" | "newyork" | "asia";
export const SESSION_LABEL: Record<LearningSession, string> = {
  london: "London",
  newyork: "New York",
  asia: "Asia",
};

/** Same fixed-UTC windows as the learning arc: 07–12 London, 12–21 NY, else Asia. */
export function sessionOfUtcHour(hour: number): LearningSession {
  if (hour >= 7 && hour < 12) return "london";
  if (hour >= 12 && hour < 21) return "newyork";
  return "asia";
}

function ms(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const n = Date.parse(iso);
  return Number.isFinite(n) ? n : null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function pct(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 100) : 0;
}

export function confidenceFor(sample: number, minSample: number): LearningConfidence {
  if (sample < minSample) return "insufficient";
  if (sample < minSample * 2) return "low";
  if (sample < minSample * 4) return "medium";
  return "high";
}

function plural(n: number, word: string): string {
  if (n === 1) return `${n} ${word}`;
  const many = /[^aeiou]y$/.test(word) ? `${word.slice(0, -1)}ies` : `${word}s`;
  return `${n} ${many}`;
}

/** Latest override per key wins. */
function latestOverrides(overrides: LearningOverride[], upTo: number): Map<string, LearningOverride> {
  const map = new Map<string, LearningOverride>();
  const sorted = [...overrides]
    .filter((o) => (ms(o.createdAt) ?? 0) <= upTo)
    .sort((a, b) => (ms(a.createdAt) ?? 0) - (ms(b.createdAt) ?? 0));
  for (const o of sorted) map.set(o.itemKey, o);
  return map;
}

/** Events before the latest reset of this family (or of "all") are forgotten. */
function resetCutoff(map: Map<string, LearningOverride>, family: LearningFamily): number {
  let cutoff = 0;
  for (const key of ["all", family]) {
    const o = map.get(key);
    if (o?.action === "reset") cutoff = Math.max(cutoff, ms(o.createdAt) ?? 0);
  }
  return cutoff;
}

export const COMPONENT_DEFS: Record<
  LearningFamily,
  { label: string; weight: number; minSample: number }
> = {
  setup: { label: "Setup fit", weight: 0.35, minSample: 5 },
  feedback: { label: "Feedback agreement", weight: 0.2, minSample: 5 },
  risk: { label: "Risk discipline", weight: 0.2, minSample: 4 },
  timing: { label: "Session timing", weight: 0.15, minSample: 5 },
  focus: { label: "Instrument focus", weight: 0.1, minSample: 5 },
};

const FAMILY_ORDER: LearningFamily[] = ["setup", "feedback", "risk", "timing", "focus"];

/* ── The model ──────────────────────────────────────────────────────────── */

export function computeLearningState(input: LearningInput): LearningState {
  const windowDays = input.windowDays ?? LEARNING_WINDOW_DAYS;
  const now = input.now;
  const windowStart = now - windowDays * DAY_MS;
  const overrides = latestOverrides(input.overrides, now);

  const tradesFor = (family: LearningFamily) => {
    const cutoff = Math.max(windowStart, resetCutoff(overrides, family));
    return input.trades.filter((t) => {
      const c = ms(t.closeTime);
      return c != null && c >= cutoff && c <= now;
    });
  };

  // Votes: one per message, latest wins; untimed votes cannot be placed in a window.
  const votesFor = (family: LearningFamily) => {
    const cutoff = Math.max(windowStart, resetCutoff(overrides, family));
    const byMsg = new Map<string, LearningVote>();
    let anon = 0;
    const out: LearningVote[] = [];
    for (const v of [...input.votes].sort((a, b) => (ms(a.at) ?? 0) - (ms(b.at) ?? 0))) {
      const at = ms(v.at);
      if (at == null || at < cutoff || at > now) continue;
      if (v.messageId) byMsg.set(v.messageId, v);
      else out.push({ ...v, messageId: `anon-${anon++}` });
    }
    return [...out, ...byMsg.values()];
  };

  const labelByTrade = new Map<string, number>();
  for (const l of input.labels) {
    const s = Number(l.axeScore);
    if (l.tradeId && l.axeScore != null && Number.isFinite(s) && s >= 0 && s <= 100) {
      labelByTrade.set(l.tradeId, s);
    }
  }

  const components: LearningComponent[] = [];
  const items: LearnedItem[] = [];
  const unknowns: UnknownItem[] = [];
  const userAdjusted = (f: LearningFamily) => overrides.has(f) || overrides.get("all")?.action === "reset";

  const hidden = (key: string) => overrides.get(key)?.action === "hide";

  // 1. Setup fit — AXE's review of each closed trade against playbook + rules.
  {
    const def = COMPONENT_DEFS.setup;
    const trades = tradesFor("setup");
    const scores = trades.map((t) => labelByTrade.get(t.id)).filter((s): s is number => s != null);
    const n = scores.length;
    const score = n >= def.minSample ? Math.round(scores.reduce((a, b) => a + b, 0) / n) : null;
    components.push({
      key: "setup",
      label: def.label,
      weight: def.weight,
      score,
      sample: n,
      minSample: def.minSample,
      confidence: confidenceFor(n, def.minSample),
      explanation:
        n > 0
          ? `Average of AXE's review of ${plural(n, "closed trade")} against your playbook and rules (${trades.length - n} not reviewed yet).`
          : "AXE has not reviewed any of your closed trades in this window yet.",
      needs: score == null ? `${n} of ${def.minSample} reviewed trades` : null,
      userAdjusted: userAdjusted("setup"),
    });
  }

  // 2. Feedback agreement — thumbs on AXE replies.
  {
    const def = COMPONENT_DEFS.feedback;
    const votes = votesFor("feedback");
    const up = votes.filter((v) => v.rating === "up").length;
    const n = votes.length;
    const score = n >= def.minSample ? pct(up, n) : null;
    components.push({
      key: "feedback",
      label: def.label,
      weight: def.weight,
      score,
      sample: n,
      minSample: def.minSample,
      confidence: confidenceFor(n, def.minSample),
      explanation:
        n > 0
          ? `${up} of ${plural(n, "rated AXE reply")} marked helpful.`
          : "No AXE replies rated in this window.",
      needs: score == null ? `${n} of ${def.minSample} rated replies` : null,
      userAdjusted: userAdjusted("feedback"),
    });
    if (n >= def.minSample && !hidden("feedback:tone")) {
      items.push({
        key: "feedback:tone",
        family: "feedback",
        label: "How AXE's answers land",
        value: `${pct(up, n)}% helpful`,
        detail: `${up} helpful, ${n - up} off, from your thumbs on AXE replies.`,
        sample: n,
        confidence: confidenceFor(n, def.minSample),
        status: "learned",
      });
    }
  }

  // 3. Risk discipline — losing trades that stayed near your typical loss.
  {
    const def = COMPONENT_DEFS.risk;
    const trades = tradesFor("risk");
    const losses = trades
      .map((t) => Number(t.pnl))
      .filter((p) => Number.isFinite(p) && p < 0)
      .map((p) => Math.abs(p));
    const n = losses.length;
    const typical = median(losses);
    const within = typical == null ? 0 : losses.filter((l) => l <= typical * 1.5).length;
    const score = n >= def.minSample ? pct(within, n) : null;
    components.push({
      key: "risk",
      label: def.label,
      weight: def.weight,
      score,
      sample: n,
      minSample: def.minSample,
      confidence: confidenceFor(n, def.minSample),
      explanation:
        n > 0 && typical != null
          ? `${within} of ${plural(n, "losing trade")} stayed within 1.5× your typical loss (${typical.toFixed(2)}).`
          : "No losing trades in this window, so AXE cannot see how you handle losses yet.",
      needs: score == null ? `${n} of ${def.minSample} losing trades` : null,
      userAdjusted: userAdjusted("risk"),
    });
    if (n >= def.minSample && typical != null && !hidden("risk:typical_loss")) {
      items.push({
        key: "risk:typical_loss",
        family: "risk",
        label: "Typical loss",
        value: typical.toFixed(2),
        detail: `Median of ${plural(n, "losing trade")}; ${n - within} went past 1.5× that.`,
        sample: n,
        confidence: confidenceFor(n, def.minSample),
        status: "learned",
      });
    } else if (n < def.minSample) {
      unknowns.push({
        key: "risk:typical_loss",
        family: "risk",
        label: "How you handle losses",
        have: n,
        need: def.minSample,
        text: `AXE needs ${def.minSample} losing trades to learn your typical loss; it has ${n}.`,
      });
    }
  }

  // 4. Session timing — entries in your main session.
  {
    const def = COMPONENT_DEFS.timing;
    const trades = tradesFor("timing");
    const counts: Record<LearningSession, number> = { london: 0, newyork: 0, asia: 0 };
    let classified = 0;
    for (const t of trades) {
      const stamp = ms(t.openTime) ?? ms(t.closeTime);
      if (stamp == null) continue;
      counts[sessionOfUtcHour(new Date(stamp).getUTCHours())] += 1;
      classified += 1;
    }
    const ranked = (Object.keys(counts) as LearningSession[]).sort((a, b) => counts[b] - counts[a]);
    const learned = classified >= def.minSample && counts[ranked[0]!] > counts[ranked[1]!] ? ranked[0]! : null;
    const correction = overrides.get("timing");
    const corrected =
      correction?.action === "correct" && correction.value && correction.value in counts
        ? (correction.value as LearningSession)
        : null;
    const main = corrected ?? learned;
    const inMain = main ? counts[main] : 0;
    const score = classified >= def.minSample && main ? pct(inMain, classified) : null;
    components.push({
      key: "timing",
      label: def.label,
      weight: def.weight,
      score,
      sample: classified,
      minSample: def.minSample,
      confidence: confidenceFor(classified, def.minSample),
      explanation: main
        ? `${inMain} of ${plural(classified, "entry")} in ${SESSION_LABEL[main]}${corrected ? " (the session you set)" : ""}.`
        : classified > 0
          ? `Entries split London ${counts.london} · New York ${counts.newyork} · Asia ${counts.asia}; no clear main session yet.`
          : "No entries in this window.",
      needs: score == null ? `${classified} of ${def.minSample} entries with a clear main session` : null,
      userAdjusted: userAdjusted("timing"),
    });
    if (main && !hidden("session:main")) {
      items.push({
        key: "session:main",
        family: "timing",
        label: "Main session",
        value: SESSION_LABEL[main],
        detail: `London ${counts.london} · New York ${counts.newyork} · Asia ${counts.asia} entries (UTC windows).`,
        sample: classified,
        confidence: confidenceFor(classified, def.minSample),
        status: corrected ? "corrected" : "learned",
        ...(corrected && learned && learned !== corrected ? { learnedValue: SESSION_LABEL[learned] } : {}),
      });
    } else if (!main) {
      unknowns.push({
        key: "session:main",
        family: "timing",
        label: "Main session",
        have: classified,
        need: def.minSample,
        text:
          classified < def.minSample
            ? `AXE needs ${def.minSample} entries to learn your main session; it has ${classified}.`
            : "Your entries are split evenly — AXE will not guess a main session.",
      });
    }
    // Per-session edge: only where that session has enough trades on its own.
    for (const s of ranked) {
      const inSession = trades.filter((t) => {
        const stamp = ms(t.openTime) ?? ms(t.closeTime);
        return stamp != null && sessionOfUtcHour(new Date(stamp).getUTCHours()) === s;
      });
      const key = `session:${s}:edge`;
      if (inSession.length < def.minSample || hidden(key)) continue;
      const wins = inSession.filter((t) => Number(t.pnl) > 0).length;
      const net = inSession.reduce((a, t) => a + (Number.isFinite(Number(t.pnl)) ? Number(t.pnl) : 0), 0);
      items.push({
        key,
        family: "timing",
        label: `${SESSION_LABEL[s]} results`,
        value: `${pct(wins, inSession.length)}% wins`,
        detail: `${wins} of ${plural(inSession.length, "trade")} won, net ${net.toFixed(2)}.`,
        sample: inSession.length,
        confidence: confidenceFor(inSession.length, def.minSample),
        status: "learned",
      });
    }
  }

  // 5. Instrument focus — trades on what you said you trade (or what you trade most).
  {
    const def = COMPONENT_DEFS.focus;
    const trades = tradesFor("focus");
    const bySymbol = new Map<string, { n: number; wins: number; net: number }>();
    for (const t of trades) {
      const s = normaliseLearningSymbol(t.symbol);
      if (!s) continue;
      const row = bySymbol.get(s) ?? { n: 0, wins: 0, net: 0 };
      row.n += 1;
      const p = Number(t.pnl);
      if (Number.isFinite(p)) {
        row.net += p;
        if (p > 0) row.wins += 1;
      }
      bySymbol.set(s, row);
    }
    const total = [...bySymbol.values()].reduce((a, r) => a + r.n, 0);
    const ranked = [...bySymbol.entries()].sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]));
    const correction = overrides.get("focus");
    const correctedList =
      correction?.action === "correct" && correction.value
        ? correction.value.split(",").map(normaliseLearningSymbol).filter(Boolean)
        : null;
    const declared = input.declaredSymbols.map(normaliseLearningSymbol).filter(Boolean);
    const focus = correctedList ?? (declared.length ? declared : ranked.slice(0, 2).map(([s]) => s));
    const basis = correctedList ? "the list you set" : declared.length ? "your watchlist" : "your two most-traded";
    const onFocus = ranked.filter(([s]) => focus.includes(s)).reduce((a, [, r]) => a + r.n, 0);
    const score = total >= def.minSample && focus.length ? pct(onFocus, total) : null;
    components.push({
      key: "focus",
      label: def.label,
      weight: def.weight,
      score,
      sample: total,
      minSample: def.minSample,
      confidence: confidenceFor(total, def.minSample),
      explanation:
        total > 0
          ? `${onFocus} of ${plural(total, "trade")} on ${basis} (${focus.slice(0, 6).join(", ") || "none"}).`
          : "No closed trades in this window.",
      needs: score == null ? `${total} of ${def.minSample} closed trades` : null,
      userAdjusted: userAdjusted("focus"),
    });
    for (const [symbol, r] of ranked.slice(0, 5)) {
      const key = `instrument:${symbol}`;
      if (r.n < 2 || hidden(key)) continue;
      items.push({
        key,
        family: "focus",
        label: symbol,
        value: `${pct(r.n, total)}% of trades`,
        detail: `${plural(r.n, "trade")}, ${r.wins} won, net ${r.net.toFixed(2)}.`,
        sample: r.n,
        confidence: confidenceFor(r.n, def.minSample),
        status: correctedList && !correctedList.includes(symbol) ? "corrected" : "learned",
      });
    }
    if (total < def.minSample) {
      unknowns.push({
        key: "focus:instruments",
        family: "focus",
        label: "Which instruments you trade",
        have: total,
        need: def.minSample,
        text: `AXE needs ${def.minSample} closed trades to rank your instruments; it has ${total}.`,
      });
    }
  }

  // Unknowns for components with too little data that have no item-level unknown yet.
  for (const c of components) {
    if (c.score != null) continue;
    if (unknowns.some((u) => u.family === c.key)) continue;
    unknowns.push({
      key: `${c.key}:component`,
      family: c.key,
      label: c.label,
      have: c.sample,
      need: c.minSample,
      text: `${c.label}: ${c.needs ?? "not enough data yet"}.`,
    });
  }

  components.sort((a, b) => FAMILY_ORDER.indexOf(a.key) - FAMILY_ORDER.indexOf(b.key));

  const windowTrades = input.trades.filter((t) => {
    const c = ms(t.closeTime);
    return c != null && c >= windowStart && c <= now;
  });
  const votesInWindow = votesFor("feedback").length;
  const dataPoints = windowTrades.length + votesInWindow;
  const ready = components.filter((c) => c.score != null);
  const weightSum = ready.reduce((a, c) => a + c.weight, 0);
  const canScore =
    dataPoints >= LEARNING_REQUIRED_POINTS && ready.length >= LEARNING_REQUIRED_COMPONENTS && weightSum > 0;
  const score = canScore
    ? Math.round(ready.reduce((a, c) => a + (c.score as number) * c.weight, 0) / weightSum)
    : null;
  const confidence: LearningConfidence = canScore
    ? confidenceFor(dataPoints, LEARNING_REQUIRED_POINTS)
    : "insufficient";

  const headline = canScore
    ? `AXE fit ${score}% from ${plural(windowTrades.length, "closed trade")} and ${plural(votesInWindow, "rated reply")} (last ${windowDays} days), ${confidence} confidence.`
    : `AXE is still learning: ${Math.min(dataPoints, LEARNING_REQUIRED_POINTS)} of ${LEARNING_REQUIRED_POINTS} data points, ${ready.length} of ${LEARNING_REQUIRED_COMPONENTS} parts measurable.`;

  return {
    version: LEARNING_MODEL_VERSION,
    asOf: new Date(now).toISOString(),
    windowDays,
    status: canScore ? "scored" : "learning",
    score,
    confidence,
    dataPoints,
    requiredPoints: LEARNING_REQUIRED_POINTS,
    readyComponents: ready.length,
    requiredComponents: LEARNING_REQUIRED_COMPONENTS,
    headline,
    components,
    items,
    unknowns,
    counts: {
      trades: windowTrades.length,
      labelled: windowTrades.filter((t) => labelByTrade.has(t.id)).length,
      votes: votesInWindow,
      accounts: new Set(windowTrades.map((t) => t.accountId ?? "unknown")).size,
    },
  };
}

/* ── History and change log ─────────────────────────────────────────────── */

/** Weekly reconstruction: what the model would have said at the end of each week. */
export function learningHistory(input: LearningInput, weeks = 12): LearningHistoryPoint[] {
  const points: LearningHistoryPoint[] = [];
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const at = input.now - i * 7 * DAY_MS;
    const s = computeLearningState({ ...input, now: at });
    points.push({
      at: new Date(at).toISOString(),
      score: s.score,
      dataPoints: s.dataPoints,
      components: Object.fromEntries(s.components.map((c) => [c.key, c.score])),
    });
  }
  return points;
}

/** "What AXE learned this week": a diff of the state now against seven days ago. */
export function learningChanges(input: LearningInput, days = 7): LearningChange[] {
  const now = computeLearningState(input);
  const before = computeLearningState({ ...input, now: input.now - days * DAY_MS });
  const since = input.now - days * DAY_MS;
  const newTrades = input.trades.filter((t) => {
    const c = ms(t.closeTime);
    return c != null && c > since && c <= input.now;
  });
  const newVotes = input.votes.filter((v) => {
    const a = ms(v.at);
    return a != null && a > since && a <= input.now;
  });
  const symbolsOf = (trades: LearningTrade[]) =>
    [...new Set(trades.map((t) => normaliseLearningSymbol(t.symbol)).filter(Boolean))];
  const ev = (trades: LearningTrade[] = newTrades, votes = newVotes.length) => ({
    trades: trades.length,
    votes,
    symbols: symbolsOf(trades),
  });

  const changes: LearningChange[] = [];

  if (now.score != null && before.score == null) {
    changes.push({
      kind: "new",
      key: "overall",
      text: `AXE now has enough data to score its fit with you: ${now.score}%.`,
      evidence: ev(),
    });
  } else if (now.score != null && before.score != null && Math.abs(now.score - before.score) >= 3) {
    changes.push({
      kind: "score",
      key: "overall",
      text: `AXE fit ${now.score > before.score ? "rose" : "fell"} ${before.score}% → ${now.score}%.`,
      evidence: ev(),
    });
  }

  for (const c of now.components) {
    const prev = before.components.find((p) => p.key === c.key);
    const relevantTrades = c.key === "feedback" ? [] : newTrades;
    const relevantVotes = c.key === "feedback" ? newVotes.length : 0;
    if (c.score != null && prev?.score == null) {
      changes.push({
        kind: "new",
        key: c.key,
        text: `${c.label} is now measurable: ${c.score}% (${c.explanation})`,
        evidence: ev(relevantTrades, relevantVotes),
      });
    } else if (c.score != null && prev?.score != null && Math.abs(c.score - prev.score) >= 5) {
      changes.push({
        kind: c.score > prev.score ? "strengthened" : "weakened",
        key: c.key,
        text: `${c.label} ${prev.score}% → ${c.score}%. ${c.explanation}`,
        evidence: ev(relevantTrades, relevantVotes),
      });
    } else if (c.score == null && prev?.score != null) {
      changes.push({
        kind: "lost",
        key: c.key,
        text: `${c.label} dropped below its minimum sample (${c.needs}).`,
        evidence: ev(relevantTrades, relevantVotes),
      });
    }
  }

  const prevItems = new Map(before.items.map((i) => [i.key, i]));
  for (const item of now.items) {
    const prev = prevItems.get(item.key);
    const sessionEdge = /^session:(london|newyork|asia):edge$/.exec(item.key)?.[1] as LearningSession | undefined;
    const tradesForItem = item.key.startsWith("instrument:")
      ? newTrades.filter((t) => normaliseLearningSymbol(t.symbol) === item.label)
      : sessionEdge
        ? newTrades.filter((t) => {
            const stamp = ms(t.openTime) ?? ms(t.closeTime);
            return stamp != null && sessionOfUtcHour(new Date(stamp).getUTCHours()) === sessionEdge;
          })
        : item.key === "risk:typical_loss"
          ? newTrades.filter((t) => Number(t.pnl) < 0)
          : item.family === "feedback"
            ? []
            : newTrades;
    if (!prev) {
      changes.push({
        kind: "new",
        key: item.key,
        text: `Learned: ${item.label} — ${item.value}. ${item.detail}`,
        evidence: ev(tradesForItem, item.family === "feedback" ? newVotes.length : 0),
      });
    } else if (prev.value !== item.value || prev.sample !== item.sample) {
      if (item.key === "session:main" && prev.value === item.value && tradesForItem.length > 0) {
        const inMain = tradesForItem.filter((t) => {
          const stamp = ms(t.openTime) ?? ms(t.closeTime);
          return stamp != null && SESSION_LABEL[sessionOfUtcHour(new Date(stamp).getUTCHours())] === item.value;
        }).length;
        changes.push({
          kind: inMain * 2 >= tradesForItem.length ? "strengthened" : "weakened",
          key: item.key,
          text: `${plural(tradesForItem.length, "trade")} this week, ${inMain} in ${item.value}: ${item.value} as main session ${inMain * 2 >= tradesForItem.length ? "strengthened" : "weakened"}.`,
          evidence: ev(tradesForItem, 0),
        });
        continue;
      }
      const newEvents = item.family === "feedback" ? newVotes.length : tradesForItem.length;
      if (newEvents === 0) continue; // the window moved, nothing new was learned
      const eventWord = item.family === "feedback" ? "new rated reply" : "new trade";
      if (prev.value === item.value) {
        changes.push({
          kind: "strengthened",
          key: item.key,
          text: `${item.label}: still ${item.value}, confirmed by ${plural(newEvents, eventWord)} (now from ${item.sample}).`,
          evidence: ev(tradesForItem, item.family === "feedback" ? newVotes.length : 0),
        });
        continue;
      }
      changes.push({
        // A value moving is an update, not a verdict: 73% → 72% helpful is not "stronger".
        kind: "updated",
        key: item.key,
        text: `${item.label}: ${prev.value} → ${item.value} (${plural(newEvents, eventWord)}).`,
        evidence: ev(tradesForItem, item.family === "feedback" ? newVotes.length : 0),
      });
    }
  }
  const hiddenNow = new Set(
    [...latestOverrides(input.overrides, input.now).values()]
      .filter((o) => o.action === "hide")
      .map((o) => o.itemKey),
  );
  for (const prev of before.items) {
    if (hiddenNow.has(prev.key)) continue; // hidden by the trader, not forgotten
    if (!now.items.some((i) => i.key === prev.key)) {
      changes.push({
        kind: "lost",
        key: prev.key,
        text: `No longer enough recent data for ${prev.label} (was ${prev.value}).`,
        evidence: ev([], 0),
      });
    }
  }
  return changes;
}

/* ── Brief sentence ─────────────────────────────────────────────────────── */

/** The one alignment line in the morning brief. Never a constant, never a bare number. */
export function learningBriefSentence(state: LearningState | null): string {
  if (!state) {
    return "AXE could not read your learning data this morning, so it is not quoting a fit score.";
  }
  if (state.status === "learning" || state.score == null) {
    return `AXE is still learning your style — ${Math.min(state.dataPoints, state.requiredPoints)} of ${state.requiredPoints} data points so far.`;
  }
  const ready = state.components.filter((c) => c.score != null);
  const weakest = [...ready].sort((a, b) => (a.score as number) - (b.score as number))[0];
  const tail = weakest ? ` Weakest part: ${weakest.label.toLowerCase()} at ${weakest.score}%.` : "";
  return `AXE fit is ${state.score}% from ${plural(state.counts.trades, "closed trade")} and ${plural(state.counts.votes, "rated reply")}, ${state.confidence} confidence.${tail}`;
}

/* ── Coaching mode ──────────────────────────────────────────────────────── */

export type CoachingTier = "low" | "medium" | "high";
export type CoachingGateMode = "strict" | "guided" | "proactive";

export type CoachingModeDecision = {
  /** 0–100; equals the AXE fit once scored, 0 while learning or unreadable. */
  confidenceScore: number;
  tier: CoachingTier;
  gateMode: CoachingGateMode;
  /** Why this mode, in one sentence a trader can read. */
  reason: string;
};

/**
 * How freely AXE speaks (coaching tone in the system prompt / brief), from
 * the AXE fit. This only picks the mode; it does not place, size, approve or
 * block any order — execution guards are separate and unchanged.
 *
 *  - unreadable or still learning (< required data points/parts) → strict
 *  - scored with low confidence → never proactive (at most guided)
 *  - otherwise: fit ≥ 75 proactive, ≥ 45 guided, else strict
 */
export function coachingModeFromLearning(state: LearningState | null): CoachingModeDecision {
  if (!state) {
    return { confidenceScore: 0, tier: "low", gateMode: "strict", reason: "Learning data unreadable — most conservative mode." };
  }
  if (state.status !== "scored" || state.score == null) {
    return {
      confidenceScore: 0,
      tier: "low",
      gateMode: "strict",
      reason: `Still learning (${Math.min(state.dataPoints, state.requiredPoints)} of ${state.requiredPoints} data points) — most conservative mode.`,
    };
  }
  const score = Math.max(0, Math.min(100, Math.round(state.score)));
  let gateMode: CoachingGateMode = score >= 75 ? "proactive" : score >= 45 ? "guided" : "strict";
  let capped = false;
  if (gateMode === "proactive" && (state.confidence === "low" || state.confidence === "insufficient")) {
    gateMode = "guided";
    capped = true;
  }
  const tier: CoachingTier = gateMode === "proactive" ? "high" : gateMode === "guided" ? "medium" : "low";
  return {
    confidenceScore: score,
    tier,
    gateMode,
    reason: `AXE fit ${score}% (${state.confidence} confidence) → ${gateMode}${capped ? " (capped: low confidence is never proactive)" : ""}.`,
  };
}
