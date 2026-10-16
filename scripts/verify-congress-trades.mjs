/**
 * The congressional feed was dead, not missing.
 *
 * `intel_congress_trades` has had nothing writing to it since Unusual Whales
 * came out, so the intel page told every user "No congressional feed yet."
 * Alpha Vantage serves the same STOCK Act disclosures for free. These checks
 * hold the mapper to the shape the table will actually accept — the column has
 * a CHECK constraint on trade_type and a unique index across five fields, and
 * a batch that violates either is rejected whole.
 *
 * The fixture is a real response (NVDA, 2026-10-15), not an invented one.
 *
 * Run: node scripts/verify-congress-trades.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  CONGRESS_TRADES_SOURCE,
  dedupe,
  formatAmountRange,
  mapCongressTrades,
  normalizeChamber,
  normalizeDirection,
} from "../src/lib/intel/congressTrades.ts";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const fixture = JSON.parse(
  readFileSync("scripts/fixtures/congress-trades-nvda-2026-10-15.json", "utf8"),
);
const route = readFileSync("src/app/api/cron/congress-trades-sync/route.ts", "utf8");

console.log("congress trades");

check("the live response maps cleanly, nothing dropped", () => {
  const { rows, skipped } = mapCongressTrades(fixture.trades);
  assert.equal(rows.length, 2);
  assert.deepEqual(skipped, { noDirection: 0, noTicker: 0, noDate: 0, noPolitician: 0 });
  assert.equal(rows[0].politician, "Daniel Meuser", "prefer the canonical name over 'Hon. ...'");
  assert.equal(rows[0].chamber, "House", "HOUSE must not be stored as the column default 'Senate'");
  assert.equal(rows[0].amount_range, "$1,001 - $15,000", "the band the filing discloses");
  assert.equal(rows[0].source, CONGRESS_TRADES_SOURCE);
});

check("trade_type only ever holds what the CHECK constraint allows", () => {
  // check (trade_type in ('BUY', 'SELL')) — anything else rejects the batch.
  for (const word of ["purchase", "P", "buy", "Purchase (partial)"]) {
    assert.equal(normalizeDirection(word), "BUY", word);
  }
  for (const word of ["sale", "SELL", "S", "Sale (Partial)", "SALE_FULL", "partial_sale"]) {
    assert.equal(normalizeDirection(word), "SELL", word);
  }
  // A direction we cannot read is dropped, never guessed.
  for (const word of ["exchange", "RECEIVE", "", null, undefined, "???"]) {
    assert.equal(normalizeDirection(word), null, String(word));
  }
});

check("a row we cannot trust is dropped and counted, not swallowed", () => {
  const { rows, skipped } = mapCongressTrades([
    { politician: "A", symbol: "AAPL", transaction_date: "2026-01-02", transaction_type: "EXCHANGE" },
    { politician: "B", symbol: "", transaction_date: "2026-01-02", transaction_type: "BUY" },
    { politician: "C", symbol: "MSFT", transaction_date: "02/01/2026", transaction_type: "BUY" },
    { politician: "", symbol: "MSFT", transaction_date: "2026-01-02", transaction_type: "BUY" },
  ]);
  assert.equal(rows.length, 0);
  assert.deepEqual(skipped, { noDirection: 1, noTicker: 1, noDate: 1, noPolitician: 1 });
});

check("a non-ISO date never reaches a date column", () => {
  const { rows } = mapCongressTrades([
    { politician: "A", symbol: "AAPL", transaction_date: "2026-01-02", transaction_type: "BUY", notification_date: "not a date" },
  ]);
  assert.equal(rows[0].trade_date, "2026-01-02");
  assert.equal(rows[0].disclosure_date, null, "a junk disclosure date must be null, not passed through");
});

check("amount ranges read like the filing, never a made-up midpoint", () => {
  assert.equal(formatAmountRange("1001.00", "15000.00"), "$1,001 - $15,000");
  assert.equal(formatAmountRange(50000, 50000), "$50,000", "same bound is one number, not a range");
  assert.equal(formatAmountRange("1000001", null), "$1,000,001+");
  assert.equal(formatAmountRange(null, "15000"), "up to $15,000");
  assert.equal(formatAmountRange(null, null), null);
});

check("an unknown chamber does not inherit the column default", () => {
  assert.equal(normalizeChamber("HOUSE"), "House");
  assert.equal(normalizeChamber("Senate"), "Senate");
  assert.equal(normalizeChamber("¯\\_(ツ)_/¯"), null, "unknown must be explicit, not silently 'Senate'");
});

check("duplicates collapse on the same five fields as the unique index", () => {
  // create unique index ... (politician, ticker, trade_date, trade_type,
  // coalesce(amount_range, '')) — an upsert batch containing both rejects.
  const { rows } = mapCongressTrades([...fixture.trades, ...fixture.trades]);
  assert.equal(rows.length, 4, "the mapper itself does not dedupe");
  assert.equal(dedupe(rows).length, 2, "dedupe does, before the upsert sees them");
});

check("a missing key is reported, not served as an empty feed", () => {
  assert.ok(/alphavantage_key_missing/.test(route), "the route must name the missing key");
  assert.ok(/status: 503/.test(route), "and answer 503, not 200 over an empty table");
  assert.ok(/needsOperator: true/.test(route), "so the cron log says a human is needed");
});

check("a throttled call is not mistaken for a quiet day", () => {
  // Alpha Vantage answers 200 with a prose Note when you hit the rate limit.
  assert.ok(/json\.Note \?\? json\.Information/.test(route), "read the throttle notice");
  assert.ok(/rate_limited/.test(route), "and report it as such");
});

check("the upsert targets the real unique index", () => {
  assert.ok(
    /onConflict: "politician,ticker,trade_date,trade_type,amount_range"/.test(route),
    "a different conflict target means every run inserts duplicates",
  );
});

check("the route is behind CRON_SECRET like every other cron", () => {
  assert.ok(/hasCronSecret\(request\.headers\)/.test(route));
  assert.ok(/status: 401/.test(route));
});

console.log(`\n${passed} checks passed`);
