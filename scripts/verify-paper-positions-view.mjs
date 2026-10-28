/**
 * Seeing your practice positions — and never seeing a number that is not true.
 *
 * The positions page loads from MetaApi and requires a `cloud_mt5` account, so
 * someone practising on paper saw nothing: orders went in and disappeared.
 * That is the worst thing a practice account can do, because the trader
 * cannot tell a working app from a broken one.
 *
 * Opening that up has one trap, and it is the same one as everywhere else in
 * this feature: a position opened at generated prices must not be shown with
 * a P/L derived from a real tick. It would look exactly like every other P/L
 * in the app, and the trader would act on it.
 *
 * Run: node scripts/verify-paper-positions-view.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { mayJudgeWith } from "../src/lib/trading/paperStopRules.ts";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const loader = read("src/lib/broker/loadPaperPositions.ts");
const page = read("src/lib/broker/loadPositionsPageData.ts");

console.log("a practice account is no longer invisible");

check("the page checks for a practice account before requiring a broker", () => {
  const paperBranch = page.indexOf('connection_method === "demo_paper"');
  const tokenCheck = page.indexOf("getMetaApiToken()");
  assert.ok(paperBranch > 0, "the page must know about practice accounts");
  assert.ok(tokenCheck > paperBranch, "and must not demand a broker token first");
});

check("the practice branch returns its own positions", () => {
  assert.ok(page.includes("loadPaperPositions("), "it must read the paper table");
  const idx = page.indexOf("loadPaperPositions(");
  const after = page.slice(idx, idx + 900);
  assert.ok(/return emptyPositions\(\{/.test(after), "and return, not fall through to MetaApi");
  assert.ok(/brokerAccountId: activeId/.test(after), "close/modify calls need the account id");
});

check("an empty practice account says what to do, not nothing", () => {
  assert.ok(
    /Place an order from the chart and it appears here/.test(page),
    "an empty list must be distinguishable from a broken page",
  );
});

console.log("\nno number is shown that cannot be trusted");

check("the loader uses the same gate as the watcher", () => {
  // If these two ever disagree, the page shows a P/L the watcher would refuse
  // to act on — and the trader sees a profit that will never be realised.
  assert.ok(/mayJudgeWith\(/.test(loader), "the page must apply the watcher's rule");
  assert.deepEqual(mayJudgeWith("simulated", "live"), {
    ok: false,
    skip: "origin-mismatch",
    detail:
      "opened at generated prices, so it is not judged against a real tick — the difference would not be a profit or a loss",
  });
});

check("an unusable price gives an empty cell, not a stale number", () => {
  // "Not known right now" is true. A stale number says something false with
  // full confidence.
  assert.ok(
    /profit: usable \? markToMarket\(position, usable\.quote\) : null/.test(loader),
    "no price means null P/L",
  );
  assert.ok(
    /currentPrice: usable \?/.test(loader),
    "and no current price either",
  );
});

check("the rule is not bypassed with a cast", () => {
  // The one place this could be quietly undone.
  assert.ok(
    !/as ResolvedQuote|as any|!\.quote/.test(loader),
    "narrowing must be real, not asserted",
  );
  assert.ok(/const usable = allowed\.ok && resolved\.origin !== "none"/.test(loader));
});

check("the trader is told when a position was filled at generated prices", () => {
  assert.ok(/quoteOrigin/.test(loader), "the origin must survive to the row");
  assert.ok(
    /do not count towards what AXE learns about you/.test(page),
    "and be said plainly on the page",
  );
});

console.log("\nthe read is scoped");

check("positions are read by user and account, not left to RLS alone", () => {
  const idx = loader.indexOf('.from("paper_positions")');
  const near = loader.slice(idx, idx + 400);
  assert.ok(/\.eq\("user_id", userId\)/.test(near), "scope by user");
  assert.ok(/\.eq\("account_id", accountId\)/.test(near), "and by account");
});

check("one quote lookup per symbol and origin, not per position", () => {
  // A trader with eight gold positions should not cost eight identical reads.
  assert.ok(/quoteCache/.test(loader));
  assert.ok(/\$\{origin\}\|\$\{position\.symbol\}/.test(loader), "key on both, or the kinds mix");
});

console.log(`\n${passed} checks passed`);
