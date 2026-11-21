import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  clientGetSymbolPrice,
  clientPlaceOrder,
  provisioningDeleteAccount,
  provisioningFindMt5CloudAccount,
  provisioningGetAccount,
  provisioningUpdateAccount,
} from "./metaApiClient";
import { resetMt5BridgeStatusCache } from "./mt5Bridge";

const BRIDGE = "https://mt5-bridge.example.test";
const ACCOUNT = "upcomers-12347717";

type Call = { url: string; token: string | null; method: string };
let calls: Call[] = [];
const realFetch = globalThis.fetch;
const saved: Record<string, string | undefined> = {};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  for (const k of ["MT5_BRIDGE_URL", "MT5_BRIDGE_TOKEN", "MT5_BRIDGE_ACCOUNT_ID", "METAAPI_TOKEN"]) saved[k] = process.env[k];
  process.env.MT5_BRIDGE_URL = BRIDGE + "/";
  process.env.MT5_BRIDGE_TOKEN = "bridge-token";
  process.env.MT5_BRIDGE_ACCOUNT_ID = ACCOUNT;
  process.env.METAAPI_TOKEN = "metaapi-token";
  resetMt5BridgeStatusCache();
  calls = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    calls.push({ url, token: headers.get("auth-token"), method: init?.method ?? "GET" });
    if (url === `${BRIDGE}/status`) return json({ connected: true, login: 12347717, server: "Upcomers-Server" });
    if (url.includes("/current-price")) return json({ symbol: "XAUUSD", bid: 1, ask: 2 });
    if (url.endsWith("/trade")) return json({ stringCode: "TRADE_RETCODE_DONE", numericCode: 10009, orderId: "9" });
    return json([], 200);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("MT5 bridge as a MetaApi region", () => {
  it("sends a bridge account's calls to the bridge with the bridge token", async () => {
    await clientGetSymbolPrice(ACCOUNT, "XAUUSD", "bridge");
    assert.deepEqual(calls, [{
      url: `${BRIDGE}/users/current/accounts/${ACCOUNT}/symbols/XAUUSD/current-price`,
      token: "bridge-token",
      method: "GET",
    }]);
  });

  it("leaves MetaApi accounts on MetaApi with MetaApi's token", async () => {
    await clientGetSymbolPrice("abc", "XAUUSD", "london");
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /agiliumtrade\.ai\/users\/current\/accounts\/abc\//);
    assert.equal(calls[0].token, "metaapi-token");
  });

  it("never sends the bridge token to MetaApi or MetaApi's token to the bridge", async () => {
    await clientPlaceOrder({ accountId: ACCOUNT, symbol: "XAUUSD", actionType: "ORDER_TYPE_BUY", volume: 0.01, region: "bridge" });
    await clientGetSymbolPrice("abc", "XAUUSD", "london");
    for (const c of calls) {
      if (c.url.startsWith(BRIDGE)) assert.equal(c.token, "bridge-token");
      else assert.equal(c.token, "metaapi-token");
    }
  });

  it("refuses a bridge-region call when the bridge is not configured, instead of calling MetaApi", async () => {
    delete process.env.MT5_BRIDGE_URL;
    await assert.rejects(clientGetSymbolPrice(ACCOUNT, "XAUUSD", "bridge"), /MT5 bridge account/);
    assert.equal(calls.length, 0);
  });

  it("reports the bridge account as DEPLOYED, connected per the bridge, in region bridge", async () => {
    const acc = await provisioningGetAccount(ACCOUNT);
    assert.equal(acc.state, "DEPLOYED");
    assert.equal(acc.connectionStatus, "CONNECTED");
    assert.equal(acc.region, "bridge");
    assert.ok(calls.every((c) => c.url.startsWith(BRIDGE)), "provisioning for the bridge account never asks MetaApi");
  });

  it("finds the bridge when its terminal holds that login and server", async () => {
    const acc = await provisioningFindMt5CloudAccount({ login: "12347717", server: "upcomers-server" });
    assert.equal(acc?.id, ACCOUNT);
  });

  it("never deletes anything or sends a password for the bridge account", async () => {
    await provisioningDeleteAccount(ACCOUNT);
    await assert.rejects(provisioningUpdateAccount(ACCOUNT, { name: "x", password: "secret", server: "Upcomers-Server" }));
    assert.equal(calls.length, 0);
  });
});
