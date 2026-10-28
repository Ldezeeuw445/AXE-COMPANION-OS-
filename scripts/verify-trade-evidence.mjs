/**
 * Keeping a random walk out of somebody's edge.
 *
 * Paper trades land in `broker_trades` on purpose, so the journal and the
 * learning arc work on them without changes. The ones filled from the demo
 * generator carry `raw.counts_as_evidence: false`.
 *
 * That flag was written from the first day paper trading existed and nothing
 * read it. Ten services queried `broker_trades`; none knew it was there. So
 * `playbookEdge` would have counted a fill at an invented price and reported
 * it back as "your London XAUUSD longs win 64% of the time" — a claim about a
 * person, built on a random number generator, arriving through their own
 * journal where they have every reason to believe it.
 *
 * These checks hold the line in both directions: the claims are filtered, and
 * a real broker trade is never filtered out by accident.
 *
 * Run: node scripts/verify-trade-evidence.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  EVIDENCE_ONLY_FILTER,
  evidenceOnly,
  rowCountsAsEvidence,
} from "../src/lib/trading/tradeEvidence.ts";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

console.log("which trades may say something about the trader");

check("a real broker fill counts — absence means yes, not unknown", () => {
  // Every row written before paper trading existed has no such field. If
  // absence meant "unknown" the filter would erase the trader's whole history.
  assert.equal(rowCountsAsEvidence(undefined), true);
  assert.equal(rowCountsAsEvidence(null), true);
  assert.equal(rowCountsAsEvidence({}), true);
  assert.equal(rowCountsAsEvidence({ paper: true }), true, "a paper row with no verdict still counts");
});

check("a paper fill at a live spread counts", () => {
  assert.equal(rowCountsAsEvidence({ paper: true, counts_as_evidence: true }), true);
});

check("a paper fill at generated prices does not", () => {
  assert.equal(rowCountsAsEvidence({ paper: true, counts_as_evidence: false }), false);
  assert.equal(rowCountsAsEvidence({ counts_as_evidence: "false" }), false, "jsonb can round-trip to a string");
});

check("the list filter keeps the right rows", () => {
  const rows = [
    { id: "broker", raw: {} },
    { id: "paper-live", raw: { counts_as_evidence: true } },
    { id: "paper-sim", raw: { counts_as_evidence: false } },
    { id: "old", raw: undefined },
  ];
  assert.deepEqual(evidenceOnly(rows).map((r) => r.id), ["broker", "paper-live", "old"]);
});

console.log("\nthe filter is applied where claims are made");

const claims = [
  ["src/services/weakSpotService.ts", "weakSpots and playbookEdge"],
  ["src/services/learningArcService.ts", "the learning arc"],
  ["src/services/userKnowledgeService.ts", "what AXE believes about the trader"],
];

for (const [file, what] of claims) {
  check(`${what} asks for evidence only`, () => {
    const src = read(file);
    assert.ok(
      src.includes("EVIDENCE_ONLY_FILTER"),
      `${file} turns closed trades into a claim and must filter`,
    );
    assert.ok(
      /\.or\(EVIDENCE_ONLY_FILTER\)/.test(src),
      "applied as a query filter, so a service cannot fetch rows and forget",
    );
  });
}

check("the filter covers both the missing field and the true case", () => {
  // Getting this wrong in either direction is silent: too strict erases real
  // history, too loose lets the generator back in.
  assert.ok(EVIDENCE_ONLY_FILTER.includes("is.null"), "pre-existing broker rows have no field");
  assert.ok(EVIDENCE_ONLY_FILTER.includes("eq.true"), "paper fills at a live spread do");
  assert.ok(!EVIDENCE_ONLY_FILTER.includes("eq.false"), "never ask for the excluded case");
});

console.log("\nand not applied where it would hide real activity");

check("counting what the trader did is not a claim about them", () => {
  // "You closed 12 trades this week" is true of practice trades too. Filtering
  // here would under-report their own activity back at them.
  const cockpit = read("src/services/cockpitService.ts");
  assert.ok(
    !/EVIDENCE_ONLY_FILTER/.test(cockpit),
    "a head-count of activity should stay a head-count",
  );
});

check("the rule lives in one file, not copied into each caller", () => {
  const module = read("src/lib/trading/tradeEvidence.ts");
  assert.ok(/counts_as_evidence/.test(module));
  for (const [file] of claims) {
    const src = read(file);
    assert.ok(
      !/raw->>counts_as_evidence/.test(src),
      `${file} must import the filter, not spell it out — two copies drift`,
    );
  }
});

console.log(`\n${passed} checks passed`);
