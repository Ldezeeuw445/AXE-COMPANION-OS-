import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { detectProviders } from "./providerStatus.ts";

const UW_ENV = ["UNUSUAL_WHALES_ENABLED", "UNUSUAL_WHALES_TOKEN", "UNUSUAL_WHALES_API_KEY"] as const;

afterEach(() => {
  for (const k of UW_ENV) delete process.env[k];
});

describe("detectProviders Unusual Whales", () => {
  it("shows paused by default even when a leftover key is set", () => {
    process.env.UNUSUAL_WHALES_TOKEN = "leftover";
    delete process.env.UNUSUAL_WHALES_ENABLED;
    const uw = detectProviders().find((p) => p.id === "unusualWhales");
    assert.equal(uw?.state, "paused");
  });

  it("shows live only when explicitly enabled and a key is set", () => {
    process.env.UNUSUAL_WHALES_ENABLED = "true";
    process.env.UNUSUAL_WHALES_TOKEN = "active";
    const uw = detectProviders().find((p) => p.id === "unusualWhales");
    assert.equal(uw?.state, "live");
  });

  it("shows missing_config when enabled but no key is set", () => {
    process.env.UNUSUAL_WHALES_ENABLED = "true";
    delete process.env.UNUSUAL_WHALES_TOKEN;
    delete process.env.UNUSUAL_WHALES_API_KEY;
    const uw = detectProviders().find((p) => p.id === "unusualWhales");
    assert.equal(uw?.state, "missing_config");
  });
});
