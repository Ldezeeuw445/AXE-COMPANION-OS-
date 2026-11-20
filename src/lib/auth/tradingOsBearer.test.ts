import { test } from "node:test";
import assert from "node:assert/strict";
import { tradingOsCors, withTradingOsCors } from "./tradingOsBearer";

const req = (origin: string) => new Request("https://axecompanion.com/api/mt5/order", { headers: { Origin: origin } });

test("Trading OS gets CORS for the order route, Bearer only", () => {
  const h = tradingOsCors(req("https://tradingosapp.com"));
  assert.equal(h["Access-Control-Allow-Origin"], "https://tradingosapp.com");
  assert.equal(h["Access-Control-Allow-Headers"], "Authorization, Content-Type");
  assert.equal(h["Access-Control-Allow-Credentials"], undefined);
});

test("any other origin gets no CORS", () => {
  assert.equal(tradingOsCors(req("https://evil.example"))["Access-Control-Allow-Origin"], undefined);
});

test("withTradingOsCors keeps status and body", async () => {
  const res = withTradingOsCors(req("https://tradingosapp.com"), Response.json({ ok: false }, { status: 403 }));
  assert.equal(res.status, 403);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), "https://tradingosapp.com");
  assert.deepEqual(await res.json(), { ok: false });
});
