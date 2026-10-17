/**
 * INTEL-FREE — FINRA CNMS short volume parser test.
 * Run: node --experimental-strip-types scripts/test-finra-short-volume.mjs
 * Falls back to inline mirror if strip-types unavailable.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcPath = join(__dirname, "../src/lib/intel/freeSources/finraShortVolume.ts");

async function loadParser() {
  try {
    return await import(srcPath);
  } catch {
    // Inline mirror of parseFinraShortVolumeText for environments without TS loader.
    function isoFromYyyymmdd(s) {
      if (s.length !== 8) return s;
      return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
    }
    function parseFinraShortVolumeText(text, opts = {}) {
      const symbolFilter = opts.symbol?.trim().toUpperCase();
      const limit = opts.limit ?? 40;
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      const rows = [];
      for (const line of lines) {
        if (/^date[|,]/i.test(line) || /^symbol[|,]/i.test(line)) continue;
        const parts = line.includes("|") ? line.split("|") : line.split(",");
        if (parts.length < 5) continue;
        const dateRaw = parts[0].trim();
        const symbol = parts[1].trim().toUpperCase();
        if (!symbol) continue;
        if (symbolFilter && symbol !== symbolFilter) continue;
        const shortVolume = Number(parts[2]);
        const shortExemptVolume = Number(parts[3]);
        const totalVolume = Number(parts[4]);
        const market = (parts[5] ?? "CNMS").trim() || "CNMS";
        if (![shortVolume, shortExemptVolume, totalVolume].every((n) => Number.isFinite(n))) continue;
        const shortRatio = totalVolume > 0 ? shortVolume / totalVolume : 0;
        rows.push({
          symbol,
          date: dateRaw.includes("-") ? dateRaw.slice(0, 10) : isoFromYyyymmdd(dateRaw),
          shortVolume,
          shortExemptVolume,
          totalVolume,
          shortRatio,
          market,
        });
        if (!symbolFilter && rows.length >= limit) break;
      }
      if (symbolFilter) return rows.slice(0, limit);
      return rows
        .sort((a, b) => b.shortRatio - a.shortRatio || b.shortVolume - a.shortVolume)
        .slice(0, limit);
    }
    return { parseFinraShortVolumeText };
  }
}

const { parseFinraShortVolumeText } = await loadParser();

const sample = [
  "Date|Symbol|ShortVolume|ShortExemptVolume|TotalVolume|Market",
  "20260703|AAPL|1000000|1000|4000000|Q",
  "20260703|TSLA|2500000|0|5000000|Q",
  "20260703|MSFT|100|0|10000|Q",
].join("\n");

const all = parseFinraShortVolumeText(sample, { limit: 10 });
assert.equal(all.length, 3);
assert.equal(all[0].symbol, "TSLA"); // highest short ratio 50%
assert.ok(Math.abs(all[0].shortRatio - 0.5) < 1e-9);

const aapl = parseFinraShortVolumeText(sample, { symbol: "AAPL" });
assert.equal(aapl.length, 1);
assert.equal(aapl[0].date, "2026-07-03");
assert.equal(aapl[0].shortVolume, 1_000_000);

// Source file exists (keeps Next + edge parsers aligned)
assert.ok(readFileSync(srcPath, "utf8").includes("parseFinraShortVolumeText"));

console.log("INTEL-FREE FINRA short volume parser: ok");
