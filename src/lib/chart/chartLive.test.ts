import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { sameOriginChartWsUrl } from "./sameOriginWsUrl";
import { getChartSessionSecret, getExplicitChartWsUrl } from "./chartSessionSecret";
import { resolveChartLiveUrls } from "./resolveChartLiveUrls";
import { signChartSessionToken, verifyChartSessionToken } from "./sessionToken";

function headers(init: Record<string, string>) {
  const h = new Headers(init);
  return { headers: { get: (name: string) => h.get(name) } };
}

describe("sameOriginChartWsUrl", () => {
  it("builds wss for production host via forwarded proto", () => {
    const url = sameOriginChartWsUrl(
      headers({ host: "www.axecompanion.com", "x-forwarded-proto": "https" }),
    );
    assert.equal(url, "wss://www.axecompanion.com/ws/chart");
  });

  it("prefers x-forwarded-host and strips extras", () => {
    const url = sameOriginChartWsUrl(
      headers({
        host: "127.0.0.1:5000",
        "x-forwarded-host": "www.axecompanion.com, localhost",
        "x-forwarded-proto": "https, http",
      }),
    );
    assert.equal(url, "wss://www.axecompanion.com/ws/chart");
  });

  it("uses ws on localhost without forwarded proto", () => {
    const url = sameOriginChartWsUrl(headers({ host: "localhost:5000" }));
    assert.equal(url, "ws://localhost:5000/ws/chart");
  });

  it("returns null without a host", () => {
    assert.equal(sameOriginChartWsUrl(headers({})), null);
  });
});

describe("resolveChartLiveUrls", () => {
  it("prefers same-origin over Cloudflare", () => {
    const resolved = resolveChartLiveUrls({
      sameOrigin: "wss://www.axecompanion.com/ws/chart",
      explicit: "wss://chart.axecompanion.com/ws/chart",
      secretSource: "env",
    });
    assert.equal(resolved.wsUrl, "wss://www.axecompanion.com/ws/chart");
    assert.equal(resolved.fallbackWsUrl, "wss://chart.axecompanion.com/ws/chart");
    assert.equal(resolved.reason, "same_origin");
  });

  it("still returns a wsUrl when only same-origin exists (no Cloudflare env)", () => {
    const resolved = resolveChartLiveUrls({
      sameOrigin: "wss://www.axecompanion.com/ws/chart",
      explicit: "",
      secretSource: "derived",
    });
    assert.equal(resolved.wsUrl, "wss://www.axecompanion.com/ws/chart");
    assert.equal(resolved.fallbackWsUrl, null);
    assert.equal(resolved.reason, "same_origin");
  });

  it("falls back to explicit Cloudflare when same-origin is missing", () => {
    const resolved = resolveChartLiveUrls({
      sameOrigin: null,
      explicit: "wss://chart.axecompanion.com/ws/chart",
      secretSource: "derived",
    });
    assert.equal(resolved.wsUrl, "wss://chart.axecompanion.com/ws/chart");
    assert.equal(resolved.reason, "derived");
  });
});

describe("chart session secret + JWT", () => {
  const saved: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const key of [
      "CHART_SESSION_JWT_SECRET",
      "SUPABASE_SERVICE_ROLE_KEY",
      "METAAPI_TOKEN",
      "AXE_METAAPI_TOKEN",
      "CHART_WS_URL",
      "NEXT_PUBLIC_CHART_WS_URL",
    ]) {
      if (key in saved) {
        const value = saved[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
        delete saved[key];
      }
    }
  });

  function setEnv(key: string, value: string | undefined) {
    saved[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  it("derives a secret so same-origin WS can sign without CHART_SESSION_JWT_SECRET", () => {
    setEnv("CHART_SESSION_JWT_SECRET", undefined);
    setEnv("SUPABASE_SERVICE_ROLE_KEY", undefined);
    setEnv("METAAPI_TOKEN", "meta-token");
    const { secret, source } = getChartSessionSecret();
    assert.equal(source, "derived");
    assert.ok(secret.includes("meta-token"));
  });

  it("signs and verifies a chart session token", async () => {
    const { token } = await signChartSessionToken(
      {
        userId: "user-1",
        accountId: "acct-1",
        metaApiAccountId: "meta-1",
        displaySymbol: "XAUUSD",
        brokerSymbol: "XAUUSDm",
        timeframe: "h1",
        ttlSeconds: 120,
      },
      "test-secret",
    );
    const payload = await verifyChartSessionToken(token, "test-secret");
    assert.ok(payload);
    assert.equal(payload?.userId, "user-1");
    assert.equal(payload?.accountId, "acct-1");
    assert.equal(payload?.displaySymbol, "XAUUSD");
    assert.equal(await verifyChartSessionToken(token, "wrong-secret"), null);
    assert.equal(await verifyChartSessionToken("not-a-jwt", "test-secret"), null);
  });

  it("reads explicit Cloudflare URL only from env", () => {
    setEnv("CHART_WS_URL", undefined);
    setEnv("NEXT_PUBLIC_CHART_WS_URL", "wss://chart.example/ws/chart");
    assert.equal(getExplicitChartWsUrl(), "wss://chart.example/ws/chart");
  });
});
