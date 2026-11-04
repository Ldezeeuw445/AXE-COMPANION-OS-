/**
 * Which closed trades may be used to say something about the trader.
 *
 * `playbookEdge` turns closed trades into sentences like "your London XAUUSD
 * longs: 14 trades, 64% won, +18.40 each". `weakSpots` does the mirror image.
 * Both are claims about a person, and both are only worth anything if every
 * trade behind them happened at a price that existed.
 *
 * Practice trades land in the same `broker_trades` table — deliberately, so
 * the journal and the learning arc work on them without changes. The ones
 * filled from the demo generator carry `raw.counts_as_evidence: false`. That
 * flag was written from the first day paper trading existed and, for a while,
 * nothing read it: ten services queried `broker_trades` and none of them knew
 * it was there. The marking was decoration, and a random walk was on its way
 * into somebody's edge.
 *
 * This is the one place that decides. Three cases:
 *
 *   - a real broker fill has no such field → counts
 *   - a paper fill at a live spread has `true` → counts
 *   - a paper fill at generated prices has `false` → does not
 *
 * Absence means "counts", not "unknown", and that is the right default: every
 * row written before this existed is a real broker fill.
 */

/**
 * PostgREST filter for the queries that feed claims about the trader.
 *
 * Expressed as a filter rather than done in JavaScript so a service cannot
 * accidentally fetch a thousand rows and forget to apply it. `is.null` covers
 * every pre-existing broker row; `eq.true` covers paper fills at a real
 * spread.
 */
export const EVIDENCE_ONLY_FILTER =
  "raw->>counts_as_evidence.is.null,raw->>counts_as_evidence.eq.true";

/**
 * Whether one row counts, for callers that already have the data in hand.
 *
 * Takes the `raw` payload rather than the whole row: the only field that
 * decides lives there, and passing the row would invite reading other things
 * from it.
 */
export function rowCountsAsEvidence(raw: unknown): boolean {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return true;
  const value = (raw as Record<string, unknown>).counts_as_evidence;
  if (value === false) return false;
  // A string "false" is what a jsonb round-trip through some clients produces.
  if (value === "false") return false;
  return true;
}

/** Keep only the trades that may inform a claim about the trader. */
export function evidenceOnly<T extends { raw?: unknown }>(rows: readonly T[]): T[] {
  return rows.filter((row) => rowCountsAsEvidence(row.raw));
}
