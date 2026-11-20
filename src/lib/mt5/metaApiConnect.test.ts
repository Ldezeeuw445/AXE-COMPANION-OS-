import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { classifyClientApiError, userMessageForCode } from "./metaApiErrors";
import { clientApiHostForRegion, marketDataHostForRegion } from "./metaApiRegions";

const read = (p: string) => readFileSync(new URL(`../../../${p}`, import.meta.url), "utf8");

describe("MetaApi hosts per region", () => {
  it("keeps London on the host that answers and moves New York and Singapore to MetaApi's v1 host", () => {
    // 2026-11-20: mt-client-api-vzsrmwxzqcwfarnn.new-york served a self-signed
    // certificate and the .singapore one had no DNS, so every call failed.
    assert.equal(clientApiHostForRegion("london"), "https://mt-client-api-vzsrmwxzqcwfarnn.london.agiliumtrade.ai");
    assert.equal(clientApiHostForRegion("new-york"), "https://mt-client-api-v1.new-york.agiliumtrade.ai");
    assert.equal(clientApiHostForRegion("singapore"), "https://mt-client-api-v1.singapore.agiliumtrade.ai");
    assert.equal(clientApiHostForRegion(null), "https://mt-client-api-vzsrmwxzqcwfarnn.london.agiliumtrade.ai");
  });

  it("routes a region MetaApi reports but the table does not list to that region, not to London", () => {
    assert.equal(clientApiHostForRegion("vint-hill"), "https://mt-client-api-v1.vint-hill.agiliumtrade.ai");
    assert.equal(marketDataHostForRegion("vint-hill"), "https://mt-market-data-client-api-v1.vint-hill.agiliumtrade.ai");
    assert.equal(clientApiHostForRegion("bad host/../x"), "https://mt-client-api-vzsrmwxzqcwfarnn.london.agiliumtrade.ai");
  });
});

describe("client API failures say what happened", () => {
  it("does not call every failure a region mismatch", () => {
    assert.equal(classifyClientApiError(401, null), "metaapi_auth_failed");
    assert.equal(classifyClientApiError(404, null), "not_found");
    assert.equal(
      classifyClientApiError(409, { error: "NotConnectedError", message: "Account is not connected to broker yet" }),
      "terminal_not_connected",
    );
    assert.equal(classifyClientApiError(504, { error: "TimeoutError", message: "Timed out waiting for the terminal" }), "metaapi_timeout");
    assert.equal(classifyClientApiError(400, { details: "E_AUTH", message: "Authentication failed" }), "mt5_invalid_credentials");
    assert.equal(classifyClientApiError(500, {}), "unknown");
  });

  it("tells the trader what to do when the terminal is not logged in", () => {
    const msg = userMessageForCode("terminal_not_connected");
    assert.match(msg, /not logged in at your broker/);
    assert.doesNotMatch(msg, /METAAPI_/);
  });
});

describe("reconnecting an account MetaApi already has", () => {
  const action = read("src/app/actions/mt5Cloud.ts");
  const client = read("src/lib/mt5/metaApiClient.ts");

  it("puts the password just typed on the existing account and redeploys it", () => {
    const reuse = action.slice(action.indexOf("if (existing) {"), action.indexOf("} else {", action.indexOf("if (existing) {")));
    assert.match(reuse, /provisioningUpdateAccount\(metaId, \{ name: label, password: mt5Password, server: mt5Server \}\)/);
    assert.ok(reuse.indexOf("provisioningUpdateAccount") < reuse.indexOf("ensureMetaApiAccountDeployment"));
    assert.match(reuse, /credentialsChanged: true/);
    assert.match(client, /method: "PUT"/);
  });

  it("trusts MetaApi's own region over the stored one when testing an account", () => {
    assert.match(action, /const resolvedRegion = liveRegion \?\? accountRegion;/);
    assert.doesNotMatch(client, /"metaapi_auth_failed" : "metaapi_region_error"/);
  });
});
