import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { regionForTimeZone } from "./metaApiRegions";

describe("regionForTimeZone", () => {
  it("puts Europe, Africa and the Gulf in London", () => {
    for (const tz of ["Europe/Amsterdam", "Europe/London", "Africa/Johannesburg", "Asia/Dubai", "Atlantic/Canary", "UTC"]) {
      assert.equal(regionForTimeZone(tz), "london", tz);
    }
  });
  it("puts the Americas in New York and Asia-Pacific in Singapore", () => {
    assert.equal(regionForTimeZone("America/New_York"), "new-york");
    assert.equal(regionForTimeZone("America/Sao_Paulo"), "new-york");
    assert.equal(regionForTimeZone("Asia/Singapore"), "singapore");
    assert.equal(regionForTimeZone("Australia/Sydney"), "singapore");
  });
  it("gives no guess when it cannot tell", () => {
    assert.equal(regionForTimeZone(""), null);
    assert.equal(regionForTimeZone(undefined), null);
    assert.equal(regionForTimeZone("Antarctica/Troll"), null);
  });
});
