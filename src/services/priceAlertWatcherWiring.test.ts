import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const watcher = readFileSync(new URL("./axeProactiveWatcher.ts", import.meta.url), "utf8");
const bridge = readFileSync(new URL("./priceAlertCronBridge.ts", import.meta.url), "utf8");
const evaluator = readFileSync(
  new URL("../lib/alerts/priceAlertCronEvaluator.ts", import.meta.url),
  "utf8",
);

describe("TOS price-alert watcher wiring", () => {
  it("includes every active price-alert user, not only smart templates", () => {
    assert.match(watcher, /priceAlertUserIds/);
    assert.match(watcher, /row\.type === "price"/);
    assert.match(watcher, /evaluatePriceAlertsForUserWithPush/);
    const block = watcher.match(/const priceAlertUserIds[\s\S]*?map\(\(row\) => row\.user_id/);
    assert.ok(block, "expected a priceAlertUserIds collector");
    assert.doesNotMatch(block[0], /smartKind/);
  });

  it("pushes price_alert and never auto-trades from the cron path", () => {
    assert.match(bridge, /category:\s*"price_alert"/);
    assert.doesNotMatch(bridge, /maybeAutoTradeOnAlert/);
    assert.doesNotMatch(evaluator, /maybeAutoTradeOnAlert/);
    assert.doesNotMatch(watcher, /maybeAutoTradeOnAlert/);
  });
});
