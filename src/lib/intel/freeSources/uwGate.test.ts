import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

  it("uses the app's flag rule: only \"true\", trimmed, any case", () => {
    for (const flag of ["true", "TRUE ", " True"]) {
      assert.equal(
        isUnusualWhalesEnabled(env({ UNUSUAL_WHALES_ENABLED: flag, UNUSUAL_WHALES_TOKEN: "x" })),
        true,
        JSON.stringify(flag),
      );
    }
    // The app (intelSources.envFlag) reports these as off, so the proxy must too.
    for (const flag of ["1", "yes", "on", "false"]) {
      assert.equal(
        isUnusualWhalesEnabled(env({ UNUSUAL_WHALES_ENABLED: flag, UNUSUAL_WHALES_TOKEN: "x" })),
        false,
        JSON.stringify(flag),
      );
    }
  });

  it("the edge-function copy carries the same flag rule", () => {
    // Deno can't import from src/, so intel-proxy keeps its own copy.
    const edge = readFileSync(
      new URL("../../../../supabase/functions/intel-proxy/freeSources/uwGate.ts", import.meta.url),
      "utf8",
    );
    assert.match(edge, /if \(flag !== "true"\) return false;/);
  });
});
