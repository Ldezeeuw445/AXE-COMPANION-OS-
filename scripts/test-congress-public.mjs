/**
 * INTEL-FREE — Senate/House Stock Watcher mapper test (no network).
 * Run: npm run test:congress-public
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcPath = join(
  __dirname,
  "../supabase/functions/intel-proxy/freeSources/congressPublic.ts",
);

/** Inline mirror of freeSources/congressPublic.ts pure helpers */
function mapSenateWatcherRow(r) {
  const txType = String(r.type ?? r.transaction_type ?? "").toLowerCase();
  const isPurchase = txType.includes("purchase") || txType.includes("buy");
  const ticker = String(r.ticker ?? r.symbol ?? "").trim().toUpperCase();
  const date = String(r.transaction_date ?? r.date ?? r.filing_date ?? "").slice(0, 10);
  if (!ticker || !date) return null;
  return {
    politician: String(r.senator ?? r.name ?? r.representative ?? "Unknown"),
    chamber: "Senate",
    ticker,
    direction: isPurchase ? "BUY" : "SELL",
    size: String(r.amount_range ?? r.range ?? r.amount ?? "N/A"),
    date,
  };
}

function mapHouseWatcherRow(r) {
  const txType = String(r.type ?? r.transaction_type ?? "").toLowerCase();
  const isPurchase = txType.includes("purchase") || txType.includes("buy");
  const ticker = String(r.ticker ?? r.symbol ?? "").trim().toUpperCase();
  const date = String(r.transaction_date ?? r.date ?? r.filing_date ?? "").slice(0, 10);
  if (!ticker || !date) return null;
  return {
    politician: String(r.representative ?? r.name ?? r.senator ?? "Unknown"),
    chamber: "House",
    ticker,
    direction: isPurchase ? "BUY" : "SELL",
    size: String(r.amount_range ?? r.range ?? r.amount ?? "N/A"),
    date,
  };
}

function dedupeCongressTrades(results, limit = 25) {
  const seen = new Set();
  return results
    .filter((t) => {
      const key = `${t.politician}|${t.ticker}|${t.date}|${t.direction}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, limit);
}

const senate = mapSenateWatcherRow({
  senator: "Jane Doe",
  type: "Purchase",
  ticker: "aapl",
  amount_range: "$1,001 - $15,000",
  transaction_date: "2026-07-01",
});
assert.deepEqual(senate, {
  politician: "Jane Doe",
  chamber: "Senate",
  ticker: "AAPL",
  direction: "BUY",
  size: "$1,001 - $15,000",
  date: "2026-07-01",
});

const house = mapHouseWatcherRow({
  representative: "John Smith",
  type: "Sale",
  symbol: "TSLA",
  range: "$15,001 - $50,000",
  date: "2026-07-02T12:00:00Z",
});
assert.equal(house.chamber, "House");
assert.equal(house.direction, "SELL");
assert.equal(house.date, "2026-07-02");

assert.equal(mapSenateWatcherRow({ type: "buy" }), null); // missing ticker/date

const deduped = dedupeCongressTrades([
  senate,
  { ...senate }, // duplicate
  house,
]);
assert.equal(deduped.length, 2);
assert.equal(deduped[0].ticker, "TSLA"); // newer date first

const src = readFileSync(srcPath, "utf8");
assert.ok(src.includes("export async function fetchCongressFromFreeSources"));
assert.ok(src.includes("mapSenateWatcherRow"));
assert.ok(src.includes("mapHouseWatcherRow"));

const proxy = readFileSync(
  join(__dirname, "../supabase/functions/intel-proxy/index.ts"),
  "utf8",
);
assert.ok(proxy.includes('from "./freeSources/congressPublic.ts"'));
assert.ok(!proxy.includes("async function fetchCongressFromFreeSources"));

console.log("INTEL-FREE congress public mapper: ok");
