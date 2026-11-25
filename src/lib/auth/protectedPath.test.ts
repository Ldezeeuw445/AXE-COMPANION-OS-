import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isProtectedPath,
  loginRedirectSearch,
  PROTECTED_PREFIXES,
} from "./protectedPath";

describe("isProtectedPath", () => {
  it("protects exact app pages and nested paths", () => {
    assert.equal(isProtectedPath("/wallets"), true);
    assert.equal(isProtectedPath("/wallets/foo"), true);
    assert.equal(isProtectedPath("/trading-team"), true);
    assert.equal(isProtectedPath("/trading-team/runs"), true);
    assert.equal(isProtectedPath("/settings"), true);
    assert.equal(isProtectedPath("/vault"), true);
    assert.equal(isProtectedPath("/chat"), true);
    assert.equal(isProtectedPath("/upgrade/success"), true);
    assert.equal(isProtectedPath("/accounts/broker-connect"), true);
    assert.equal(isProtectedPath("/onboarding"), true);
    assert.equal(isProtectedPath("/admin"), true);
    assert.equal(isProtectedPath("/admin/inbox"), true);
  });

  it("does not treat /market as a prefix of /marketing", () => {
    assert.equal(isProtectedPath("/market"), true);
    assert.equal(isProtectedPath("/market/xauusd"), true);
    assert.equal(isProtectedPath("/marketing"), false);
    assert.equal(isProtectedPath("/marketing/poster"), false);
  });

  it("leaves public landing, auth, and legal routes open", () => {
    for (const path of [
      "/",
      "/login",
      "/signup",
      "/welcome",
      "/pricing",
      "/offline",
      "/demo",
      "/privacy",
      "/terms",
      "/legal",
      "/contact",
    ]) {
      assert.equal(isProtectedPath(path), false, path);
    }
  });

  it("lists wallets and trading-team among the prefixes the proxy uses", () => {
    assert.ok(PROTECTED_PREFIXES.includes("/wallets"));
    assert.ok(PROTECTED_PREFIXES.includes("/trading-team"));
  });
});

describe("loginRedirectSearch", () => {
  it("puts the original path in next so login can return there", () => {
    const params = new URLSearchParams(loginRedirectSearch("/wallets"));
    assert.equal(params.get("next"), "/wallets");
    const settings = new URLSearchParams(loginRedirectSearch("/settings"));
    assert.equal(settings.get("next"), "/settings");
  });
});
