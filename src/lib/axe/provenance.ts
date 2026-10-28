/**
 * Where an idea came from, in a line the trader can check.
 *
 * AXE can already prepare an order and leave it pending — `autonomy.ts` level
 * 2, and level 3 places it unattended. What it could not do until now is say
 * *why*, in a way anyone could verify afterwards. The reasons existed, but
 * each source kept its own: `playbookEdge.ts` knew it had counted 14 closed
 * trades, `correlationEngine` knew which pair had moved, `newsProvider` knew
 * which headline landed. By the time any of it reached the trader it had been
 * flattened into a sentence, and a sentence is not evidence.
 *
 * That is a real problem and not a cosmetic one: you cannot let a machine
 * spend money for a reason nobody can read back. When a trade goes wrong the
 * only useful question is "what did it think it saw", and the answer has to
 * survive the trip to the phone.
 *
 * So provenance travels with the idea, as data:
 *
 *   source     which kind of thing noticed — their own trades, the calendar,
 *              a rule they wrote themselves. Not free text: a trader should
 *              be able to say "stop showing me correlation ideas".
 *   rule       the rule that fired, in their words, not the function name.
 *   evidence   the number it rests on, with its unit, so it can be checked.
 *   track      how often that rule held before. Null when it has never been
 *              measured — see below, that honesty is the point.
 *   observedAt when the evidence was true. A stale reason is a wrong reason.
 *
 * Two rules keep this from becoming decoration:
 *
 *  1. **An untested rule may not sound tested.** `track: null` renders as
 *     "not tested yet" rather than quietly leaving the number out. A rule with
 *     too few attempts shows the count, never a percentage — 2 out of 3 is not
 *     67%, it is three trades, and a percentage is how noise gets to wear a
 *     lab coat. Same reasoning as `MIN_EDGE_TRADES` in `playbookEdge.ts`.
 *  2. **Preparing or placing an order requires provenance.** `suggest` may go
 *     without, because a suggestion costs nothing and the trader is right
 *     there reading it. The moment AXE touches an order, `provenanceGaps`
 *     must come back empty. That is checked, not hoped for.
 *
 * Dependency-free so the verify suite can exercise it directly, like the rest
 * of this folder.
 */

/**
 * The kinds of thing that can notice something.
 *
 * A closed list on purpose: these are the names a trader will eventually be
 * able to switch off one by one, and free text cannot be switched off.
 */
export const PROVENANCE_SOURCES = [
  "own-trades",
  "open-position",
  "account-limits",
  "market-data",
  "calendar",
  "news",
  "correlation",
  "congress",
  "own-alert",
] as const;

export type ProvenanceSource = (typeof PROVENANCE_SOURCES)[number];

/** How each source introduces itself. First words of the line the trader reads. */
export const PROVENANCE_SOURCE_LABEL: Record<ProvenanceSource, string> = {
  "own-trades": "From your own closed trades",
  "open-position": "From a position you have open",
  "account-limits": "From the limits on this account",
  "market-data": "From price data",
  calendar: "From the economic calendar",
  news: "From the news feed",
  correlation: "From a correlation across your watchlist",
  congress: "From disclosed congressional trades",
  "own-alert": "From an alert you set yourself",
};

/** The number the claim rests on. */
export type ProvenanceEvidence = {
  /** What was counted or measured. "Closed London XAUUSD longs", not "n". */
  label: string;
  /** The measurement, already formatted. "14 trades, 64% won, +18.40 each". */
  value: string;
};

/**
 * How often this rule held up before.
 *
 * `tried` counts the times the rule fired and the outcome is known; `held`
 * the times it was right. Both are counts of real events — a rule that has
 * never fired has `track: null`, not `{ tried: 0, held: 0 }`, because zero
 * out of zero invites a division nobody meant to do.
 */
export type ProvenanceTrack = {
  tried: number;
  held: number;
};

export type Provenance = {
  source: ProvenanceSource;
  rule: string;
  evidence: ProvenanceEvidence;
  /** Null when this rule has no measured history. Rendered as such. */
  track: ProvenanceTrack | null;
  /** ISO. When the evidence was true, not when the notice was sent. */
  observedAt: string;
};

/**
 * Below this many attempts a track record is reported as counts, never as a
 * percentage. Eight, the same floor `playbookEdge.ts` uses before it will call
 * a slice of trades an edge — the arithmetic is the same and so is the risk of
 * naming noise confidently.
 */
export const MIN_TRACK_ATTEMPTS = 8;

/** How old evidence may be before the line says so, in hours. */
export const EVIDENCE_STALE_HOURS = 24;

function clean(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function isProvenanceSource(value: unknown): value is ProvenanceSource {
  return typeof value === "string" && (PROVENANCE_SOURCES as readonly string[]).includes(value);
}

/**
 * The track record in words — or the admission that there isn't one.
 *
 * Never returns an empty string: silence here reads as "no concerns", which is
 * the opposite of what an untested rule deserves.
 */
export function renderTrack(track: ProvenanceTrack | null): string {
  if (!track) return "not tested yet";
  const tried = Math.max(0, Math.trunc(track.tried));
  const held = Math.max(0, Math.min(tried, Math.trunc(track.held)));
  if (tried === 0) return "not tested yet";
  if (tried < MIN_TRACK_ATTEMPTS) {
    return `held ${held} of ${tried} times so far`;
  }
  const pct = Math.round((held / tried) * 100);
  return `held ${pct}% of ${tried} times`;
}

/**
 * Hours between when the evidence was true and now.
 *
 * Returns null for an unparseable or future timestamp rather than guessing:
 * a reason whose age cannot be established is handled by `provenanceGaps`,
 * not papered over here.
 */
export function evidenceAgeHours(observedAt: string, now: Date = new Date()): number | null {
  const then = Date.parse(observedAt);
  if (!Number.isFinite(then)) return null;
  const hours = (now.getTime() - then) / 3_600_000;
  if (hours < -0.05) return null;
  return Math.max(0, hours);
}

/**
 * One line, for the card under the idea and for the journal entry afterwards.
 *
 * Order is deliberate: source, rule, evidence, track. The trader's first
 * question is "who says so", and the last is "and how often has that been
 * right" — which is the part they will remember when it goes wrong.
 */
export function renderProvenance(provenance: Provenance, now: Date = new Date()): string {
  const parts = [
    PROVENANCE_SOURCE_LABEL[provenance.source],
    clean(provenance.rule),
    `${clean(provenance.evidence.label)}: ${clean(provenance.evidence.value)}`,
    renderTrack(provenance.track),
  ];

  const age = evidenceAgeHours(provenance.observedAt, now);
  if (age !== null && age >= EVIDENCE_STALE_HOURS) {
    const days = Math.floor(age / 24);
    parts.push(days >= 1 ? `measured ${days}d ago` : `measured ${Math.floor(age)}h ago`);
  }

  return parts.join(" · ");
}

/**
 * What is wrong with this provenance, in plain words. Empty means usable.
 *
 * The type already stops a producer leaving a field out; this catches the
 * version that satisfies the type with empty strings and round numbers — which
 * is what happens when someone wires a new source up in a hurry.
 */
export function provenanceGaps(provenance: Provenance, now: Date = new Date()): string[] {
  const gaps: string[] = [];

  if (!isProvenanceSource(provenance.source)) {
    gaps.push(`unknown source "${String(provenance.source)}"`);
  }

  const rule = clean(provenance.rule);
  if (!rule) gaps.push("does not say which rule fired");
  // "Signal", "setup" and friends are what gets written when nobody decided
  // what the rule actually was.
  else if (/^(signal|setup|pattern|opportunity|idea|analysis)$/i.test(rule)) {
    gaps.push(`rule "${provenance.rule}" names a category, not a rule`);
  }

  if (!clean(provenance.evidence.label)) gaps.push("does not say what was measured");
  if (!clean(provenance.evidence.value)) gaps.push("does not carry the number it rests on");

  if (provenance.track) {
    const { tried, held } = provenance.track;
    if (!Number.isFinite(tried) || !Number.isFinite(held)) {
      gaps.push("track record is not a number");
    } else if (tried < 0 || held < 0) {
      gaps.push("track record counts cannot be negative");
    } else if (held > tried) {
      gaps.push(`track record claims ${held} wins out of ${tried} attempts`);
    }
  }

  const age = evidenceAgeHours(provenance.observedAt, now);
  if (age === null) gaps.push("does not say when the evidence was true");

  return gaps;
}

/**
 * Whether AXE may take this action on this reasoning.
 *
 * `suggest` is free: saying what it would do costs nothing and the trader is
 * reading it at that moment. `prepare` and `place` are not — those touch an
 * order, and an order with no readable reason is exactly the thing this file
 * exists to prevent. So they need provenance, and provenance without gaps.
 *
 * Returns the reasons it may not, so a caller can log them. Empty means go.
 */
export function provenanceBlocks(
  action: "suggest" | "prepare" | "place",
  provenance: Provenance | null,
  now: Date = new Date(),
): string[] {
  if (action === "suggest") return [];
  if (!provenance) return ["no provenance: AXE may not prepare or place an order it cannot explain"];
  return provenanceGaps(provenance, now);
}

/* ── Builders, one per source ─────────────────────────────────────
   The modules that notice things — `playbookEdge.ts`, `weakSpots.ts`,
   `correlationEngine.ts` — have no imports at all, deliberately, so the verify
   suite can run them without a bundler. Asking them to import this file would
   break that. So the builders live here and take plain numbers instead: the
   dependency points this way, and a new source is one function below rather
   than an edit to the module that found the thing.
   ───────────────────────────────────────────────────────────────── */

/**
 * A claim resting on the trader's own closed trades.
 *
 * `trades` and `wins` become the track record directly, and that is not a
 * shortcut — for this source they are the same thing. The rule is "this slice
 * of your trading makes money"; the times it held are the trades that won.
 */
export function tradeHistoryProvenance(input: {
  rule: string;
  label: string;
  value: string;
  trades: number;
  wins: number;
  observedAt: string;
}): Provenance {
  return {
    source: "own-trades",
    rule: input.rule,
    evidence: { label: input.label, value: input.value },
    track: input.trades > 0 ? { tried: input.trades, held: input.wins } : null,
    observedAt: input.observedAt,
  };
}

/**
 * A claim resting on a rule the trader wrote themselves.
 *
 * `track` is null unless the caller has counted how often this alert's
 * condition preceded what the trader hoped for. Most callers have not, and
 * that is exactly when `renderTrack` has to say "not tested yet" — an alert
 * firing is not evidence that the alert is any good.
 */
export function alertProvenance(input: {
  rule: string;
  label: string;
  value: string;
  observedAt: string;
  track?: ProvenanceTrack | null;
}): Provenance {
  return {
    source: "own-alert",
    rule: input.rule,
    evidence: { label: input.label, value: input.value },
    track: input.track ?? null,
    observedAt: input.observedAt,
  };
}
