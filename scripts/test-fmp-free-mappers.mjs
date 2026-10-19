/**
 * INTEL-FREE — FMP insider + congress pure mappers (no network / no API key).
 * Run: npm run test:fmp-free-mappers
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

/** Inline mirror of freeSources/fmpInsider.ts mapFmpInsiderRow */
function mapFmpInsiderRow(r) {
  const ticker = String(r.symbol ?? r.ticker ?? "").toUpperCase().trim();
  if (!ticker) return null;

  const tx = String(
    r.transactionType ?? r.acquistionOrDisposition ?? r.type ?? r.transactionCode ?? "",
  ).toLowerCase();
  const isBuy =
    tx.includes("purchase") ||
    tx.includes("buy") ||
    tx === "a" ||
    tx.includes("acquisition") ||
    tx.includes("p-purchase");
  const isSell =
    tx.includes("sale") ||
    tx.includes("sell") ||
    tx === "d" ||
    tx.includes("disposition") ||
    tx.includes("s-sale");
  if (!isBuy && !isSell) return null;

  const shares = Number(r.securitiesTransacted ?? r.shares ?? r.securitiesOwned ?? 0);
  const price = Number(r.price ?? r.sharePrice ?? 0);
  const valueRaw = Number(r.value ?? r.totalValue ?? 0);
  const value = valueRaw > 0 ? valueRaw : Math.max(0, shares) * Math.max(0, price);

  const date = String(
    r.transactionDate ?? r.filingDate ?? r.date ?? r.reportingDate ?? "",
  ).slice(0, 10);
  if (!date) return null;

  const insider = String(
    r.reportingName ?? r.insiderName ?? r.name ?? r.ownerName ?? "Unknown",
  ).trim();
  const role = String(r.typeOfOwner ?? r.reporterTitle ?? r.position ?? "").trim() || undefined;

  return {
    ticker,
    insider: insider || "Unknown",
    role,
    type: isBuy ? "BUY" : "SELL",
    shares: Number.isFinite(shares) && shares > 0 ? Math.round(shares) : undefined,
    value: Number.isFinite(value) ? value : 0,
    date,
  };
}

/** Inline mirror of freeSources/fmpCongress.ts mapCongressRow */
function mapCongressRow(r, defaultChamber) {
  const type = String(r.type ?? r.transactionType ?? r.transaction ?? "").toLowerCase();
  const isPurchase =
    type.includes("purchase") || type.includes("buy") || type.includes("acquisition");
  const politician =
    `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() ||
    String(r.representative ?? r.senator ?? r.name ?? "Unknown");
  const ticker = String(r.symbol ?? r.ticker ?? r.assetDescription ?? "")
    .toUpperCase()
    .trim();
  const date = String(
    r.transactionDate ?? r.disclosureDate ?? r.dateRecieved ?? r.dateReceived ?? r.date ?? "",
  ).slice(0, 10);
  if (!ticker || !date) return null;

  return {
    politician,
    chamber: String(r.office ?? r.chamber ?? defaultChamber),
    ticker,
    direction: isPurchase ? "BUY" : "SELL",
    size: String(r.amount ?? r.range ?? r.amountRange ?? "N/A"),
    date,
  };
}

// ── Insider ──────────────────────────────────────────────────────────
const buy = mapFmpInsiderRow({
  symbol: "aapl",
  transactionType: "P-Purchase",
  securitiesTransacted: 1000,
  price: 190.5,
  transactionDate: "2026-03-01T12:00:00",
  reportingName: "Cook, Tim",
  typeOfOwner: "officer: CEO",
});
assert.deepEqual(buy, {
  ticker: "AAPL",
  insider: "Cook, Tim",
  role: "officer: CEO",
  type: "BUY",
  shares: 1000,
  value: 190500,
  date: "2026-03-01",
});

const sell = mapFmpInsiderRow({
  ticker: "MSFT",
  transactionType: "S-Sale",
  shares: 50,
  value: 20_000,
  filingDate: "2026-02-15",
  insiderName: "Nadella",
});
assert.equal(sell?.type, "SELL");
assert.equal(sell?.value, 20_000);
assert.equal(sell?.date, "2026-02-15");

assert.equal(
  mapFmpInsiderRow({
    symbol: "X",
    transactionType: "A-Award",
    shares: 100,
    transactionDate: "2026-01-01",
  }),
  null,
  "awards/grants must not map as BUY/SELL",
);
assert.equal(mapFmpInsiderRow({ transactionType: "purchase", date: "2026-01-01" }), null);

// ── Congress ─────────────────────────────────────────────────────────
const senate = mapCongressRow(
  {
    firstName: "Jane",
    lastName: "Doe",
    symbol: "nvda",
    type: "Purchase",
    amount: "$15,001 - $50,000",
    transactionDate: "2026-04-01",
  },
  "Senate",
);
assert.deepEqual(senate, {
  politician: "Jane Doe",
  chamber: "Senate",
  ticker: "NVDA",
  direction: "BUY",
  size: "$15,001 - $50,000",
  date: "2026-04-01",
});

const house = mapCongressRow(
  {
    representative: "John Smith",
    ticker: "TSLA",
    transactionType: "Sale",
    range: "$1,001 - $15,000",
    disclosureDate: "2026-05-10",
    chamber: "House of Representatives",
  },
  "House",
);
assert.equal(house?.direction, "SELL");
assert.equal(house?.chamber, "House of Representatives");
assert.equal(house?.politician, "John Smith");

assert.equal(
  mapCongressRow({ firstName: "X", type: "Purchase", transactionDate: "2026-01-01" }, "Senate"),
  null,
  "missing ticker → null",
);

// Source must export the pure mappers (not only fetch wrappers)
const insiderSrc = readFileSync(
  join(root, "supabase/functions/intel-proxy/freeSources/fmpInsider.ts"),
  "utf8",
);
const congressSrc = readFileSync(
  join(root, "supabase/functions/intel-proxy/freeSources/fmpCongress.ts"),
  "utf8",
);
assert.ok(/export function mapFmpInsiderRow/.test(insiderSrc));
assert.ok(/export function mapCongressRow/.test(congressSrc));

console.log("INTEL-FREE FMP free mappers: ok");
