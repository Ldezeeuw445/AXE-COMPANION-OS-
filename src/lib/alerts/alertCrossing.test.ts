import { test } from "node:test";
import assert from "node:assert/strict";
import { findCrossedAlerts, type AlertRow } from "./useAlertEvaluator";

const row = (o: Partial<AlertRow>): AlertRow => ({
  id: "a1",
  symbol: "XAUUSD",
  type: "price",
  condition: "above",
  threshold: 2000,
  status: "active",
  triggered_at: null,
  ...o,
});

test("fires on a real upward crossing of the same symbol", () => {
  const hits = findCrossedAlerts([row({})], "XAUUSD", { symbol: "XAUUSD", price: 1999 }, 2001);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].condition, "above");
});

test("fires on a downward crossing for below alerts", () => {
  const hits = findCrossedAlerts([row({ condition: "below", threshold: 1.05, symbol: "EURUSD" })], "eurusd", { symbol: "EURUSD", price: 1.051 }, 1.049);
  assert.equal(hits.length, 1);
});

test("no fire when previous price belongs to another symbol (chart switch)", () => {
  const hits = findCrossedAlerts([row({})], "XAUUSD", { symbol: "EURUSD", price: 1.08 }, 2600);
  assert.equal(hits.length, 0);
});

test("symbol-less alert does not fire across a switch either", () => {
  const hits = findCrossedAlerts([row({ symbol: null })], "XAUUSD", { symbol: "EURUSD", price: 1.08 }, 2600);
  assert.equal(hits.length, 0);
});

test("stale alert for another symbol is skipped", () => {
  const hits = findCrossedAlerts([row({ symbol: "US30", threshold: 2000 })], "XAUUSD", { symbol: "XAUUSD", price: 1999 }, 2001);
  assert.equal(hits.length, 0);
});

test("no previous sample means no fire", () => {
  assert.equal(findCrossedAlerts([row({})], "XAUUSD", null, 2001).length, 0);
});

test("null threshold is ignored", () => {
  assert.equal(findCrossedAlerts([row({ threshold: null })], "XAUUSD", { symbol: "XAUUSD", price: -1 }, 1).length, 0);
});
