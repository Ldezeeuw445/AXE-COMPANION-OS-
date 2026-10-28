import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isUnusualWhalesEnabled, unusualWhalesHeaders } from "./uwGate.ts";

function env(map: Record<string, string>) {
  return (key: string) => map[key] ?? "";
}

describe("INTEL-FREE Unusual Whales gate", () => {
  it("stays off without the explicit flag", () => {
    assert.equal(isUnusualWhalesEnabled(env({ UNUSUAL_WHALES_TOKEN: "tok" })), false);
    assert.equal(unusualWhalesHeaders(env({ UNUSUAL_WHALES_TOKEN: "tok" })), null);
  });

  it("requires both flag and token", () => {
    assert.equal(
      isUnusualWhalesEnabled(env({ UNUSUAL_WHALES_ENABLED: "true" })),
      false,
    );
    const headers = unusualWhalesHeaders(
      env({ UNUSUAL_WHALES_ENABLED: "true", UNUSUAL_WHALES_TOKEN: "tok" }),
    );
    assert.ok(headers);
    assert.equal(headers?.Authorization, "Bearer tok");
  });

  it("accepts common truthy flag spellings", () => {
    for (const flag of ["1", "true", "YES", "on"]) {
      assert.equal(
        isUnusualWhalesEnabled(
          env({ UNUSUAL_WHALES_ENABLED: flag, UNUSUAL_WHALES_TOKEN: "x" }),
        ),
        true,
        flag,
      );
    }
  });
});
