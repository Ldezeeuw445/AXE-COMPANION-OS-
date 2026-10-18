/**
 * INTEL-FREE — SEC EDGAR Form 4 XML parser test (no network).
 * Run: npm run test:sec-edgar
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcPath = join(
  __dirname,
  "../supabase/functions/intel-proxy/freeSources/secEdgar.ts",
);

/** Inline mirror of freeSources/secEdgar.ts pure helpers */
function xmlVal(xml, tag) {
  const outerRe = new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, "i");
  const outerMatch = xml.match(outerRe);
  if (!outerMatch) return "";
  const inner = outerMatch[0];
  const valMatch = inner.match(/<value>([\s\S]*?)<\/value>/i);
  if (valMatch) return valMatch[1].trim();
  const directMatch = inner.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
  return directMatch ? directMatch[1].trim() : "";
}

function parseForm4Xml(xml) {
  const ticker = xmlVal(xml, "issuerTradingSymbol").split(/[\s,]+/)[0].toUpperCase();
  const insiderName = xmlVal(xml, "rptOwnerName");
  const officerTitle = xmlVal(xml, "officerTitle") || undefined;
  const txDate = xmlVal(xml, "periodOfReport") || xmlVal(xml, "transactionDate");

  const trades = [];
  const txRegex = /<nonDerivativeTransaction>([\s\S]*?)<\/nonDerivativeTransaction>/gi;
  let txMatch;
  while ((txMatch = txRegex.exec(xml)) !== null) {
    const txXml = txMatch[1];
    const code = xmlVal(txXml, "transactionCode").toUpperCase();
    if (code !== "P" && code !== "S") continue;
    const shares = Math.round(Number(xmlVal(txXml, "transactionShares")) || 0);
    const price = Number(xmlVal(txXml, "transactionPricePerShare")) || 0;
    const value = Math.round(shares * price);
    if (value <= 0 && shares <= 0) continue;
    trades.push({
      ticker: ticker || "N/A",
      insider: insiderName || "Unknown",
      role: officerTitle,
      type: code === "P" ? "BUY" : "SELL",
      shares: shares > 0 ? shares : undefined,
      value,
      date: txDate,
    });
  }
  return trades;
}

function finalizeEdgarTrades(trades, symbol, limit = 25) {
  const seen = new Set();
  const unique = trades.filter((t) => {
    const key = `${t.insider}:${t.ticker}:${t.date}:${t.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  unique.sort((a, b) => b.value - a.value);
  const filtered = symbol
    ? unique.filter((t) => t.ticker === symbol || t.ticker.startsWith(symbol))
    : unique;
  return filtered.slice(0, limit);
}

const sampleXml = `
<ownershipDocument>
  <issuerTradingSymbol><value>AAPL</value></issuerTradingSymbol>
  <rptOwnerName><value>Cook Tim</value></rptOwnerName>
  <officerTitle><value>CEO</value></officerTitle>
  <periodOfReport><value>2026-07-01</value></periodOfReport>
  <nonDerivativeTransaction>
    <transactionCode><value>P</value></transactionCode>
    <transactionShares><value>1000</value></transactionShares>
    <transactionPricePerShare><value>150.5</value></transactionPricePerShare>
  </nonDerivativeTransaction>
  <nonDerivativeTransaction>
    <transactionCode><value>S</value></transactionCode>
    <transactionShares><value>200</value></transactionShares>
    <transactionPricePerShare><value>160</value></transactionPricePerShare>
  </nonDerivativeTransaction>
  <nonDerivativeTransaction>
    <transactionCode><value>A</value></transactionCode>
    <transactionShares><value>5000</value></transactionShares>
    <transactionPricePerShare><value>0</value></transactionPricePerShare>
  </nonDerivativeTransaction>
</ownershipDocument>
`;

assert.equal(xmlVal(sampleXml, "issuerTradingSymbol"), "AAPL");
assert.equal(xmlVal(sampleXml, "rptOwnerName"), "Cook Tim");

const parsed = parseForm4Xml(sampleXml);
assert.equal(parsed.length, 2, "code A (award) must be skipped; only P/S");
assert.equal(parsed[0].type, "BUY");
assert.equal(parsed[0].shares, 1000);
assert.equal(parsed[0].value, 150500);
assert.equal(parsed[1].type, "SELL");
assert.equal(parsed[1].value, 32000);
assert.equal(parsed[0].role, "CEO");
assert.equal(parsed[0].date, "2026-07-01");

const duped = finalizeEdgarTrades([...parsed, ...parsed], "AAPL");
assert.equal(duped.length, 2);
assert.equal(duped[0].value, 150500); // highest value first

const filteredOut = finalizeEdgarTrades(parsed, "MSFT");
assert.equal(filteredOut.length, 0);

const src = readFileSync(srcPath, "utf8");
assert.ok(src.includes("export function parseForm4Xml"));
assert.ok(src.includes("export function finalizeEdgarTrades"));
assert.ok(src.includes("export function xmlVal"));

console.log("INTEL-FREE SEC EDGAR Form 4 parser: ok");
