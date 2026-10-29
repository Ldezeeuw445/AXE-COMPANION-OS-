import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canConnectLiveAccount,
  countLiveBrokerAccounts,
  isLiveBrokerAccount,
  liveAccountsIncludedNotice,
  liveAccountCapMessage,
} from "./liveAccounts";
import { liveAccountsCapForPlan } from "./tiers";
import {
  chatQuotaFriendlyNotice,
  enforcedDailyChatLimit,
  nextUtcMidnightIso,
  shouldOfferChatUpgrade,
  CHAT_QUOTA_TIMEZONE,
} from "./chatLimits";

describe("live account classification", () => {
  it("counts cloud_mt5 and alpaca_live as live", () => {
    assert.equal(isLiveBrokerAccount({ connection_method: "cloud_mt5" }), true);
    assert.equal(isLiveBrokerAccount({ connection_method: "alpaca_live" }), true);
    assert.equal(isLiveBrokerAccount({ connection_method: "cloud_mt5_disconnected" }), true);
    assert.equal(isLiveBrokerAccount({ connection_method: "local_bridge" }), true);
  });

  it("never counts demo/paper toward the cap", () => {
    assert.equal(isLiveBrokerAccount({ connection_method: "demo_paper" }), false);
    assert.equal(isLiveBrokerAccount({ connection_method: "cloud_alpaca" }), false);
    assert.equal(isLiveBrokerAccount({ connection_method: "alpaca_paper_byo" }), false);
    assert.equal(isLiveBrokerAccount({ provider: "demo", connection_method: "cloud_mt5" }), false);
  });

  it("counts trading_mode=live as a fallback", () => {
    assert.equal(
      isLiveBrokerAccount({ connection_method: "something_custom", trading_mode: "live" }),
      true,
    );
  });
});

describe("live account plan caps", () => {
  it("matches pricing page: Free 1, Pro 3, Founder 5, Elite 10", () => {
    assert.equal(liveAccountsCapForPlan("free"), 1);
    assert.equal(liveAccountsCapForPlan("pro"), 3);
    assert.equal(liveAccountsCapForPlan("founder"), 5);
    assert.equal(liveAccountsCapForPlan("elite"), 10);
  });

  it("blocks a new live connect at the Free cap", () => {
    const gate = canConnectLiveAccount({
      plan: "free",
      existingAccounts: [{ id: "a1", connection_method: "cloud_mt5" }],
    });
    assert.equal(gate.allowed, false);
    if (!gate.allowed) {
      assert.equal(gate.cap, 1);
      assert.equal(gate.used, 1);
      assert.match(gate.message, /includes 1 live account/i);
    }
  });

  it("allows a new live connect under the Pro cap", () => {
    const gate = canConnectLiveAccount({
      plan: "pro",
      existingAccounts: [
        { id: "a1", connection_method: "cloud_mt5" },
        { id: "a2", connection_method: "cloud_mt5" },
        { id: "paper", connection_method: "cloud_alpaca" },
      ],
    });
    assert.equal(gate.allowed, true);
    assert.equal(gate.used, 2);
    assert.equal(gate.cap, 3);
  });

  it("ignores demo/paper when counting used slots", () => {
    const rows = [
      { id: "live1", connection_method: "cloud_mt5" },
      { id: "paper", connection_method: "cloud_alpaca" },
      { id: "demo", connection_method: "demo_paper", provider: "demo" },
    ];
    assert.equal(countLiveBrokerAccounts(rows), 1);
  });

  it("grandfathers reconnect of an existing live row (excludeAccountId)", () => {
    const existing = [
      { id: "a1", connection_method: "cloud_mt5" },
      { id: "a2", connection_method: "cloud_mt5" },
      { id: "a3", connection_method: "cloud_mt5" },
    ];
    // Free user somehow has 3 (grandfathered) — reconnecting a1 must still work.
    const reconnect = canConnectLiveAccount({
      plan: "free",
      existingAccounts: existing,
      excludeAccountId: "a1",
    });
    assert.equal(reconnect.allowed, true, "reconnect of existing must never be blocked");

    // Adding a brand-new fourth must be blocked.
    const addNew = canConnectLiveAccount({
      plan: "free",
      existingAccounts: existing,
    });
    assert.equal(addNew.allowed, false);
  });

  it("grandfathers users already above the Pro cap — they keep accounts, cannot add more", () => {
    const above = [
      { id: "1", connection_method: "cloud_mt5" },
      { id: "2", connection_method: "cloud_mt5" },
      { id: "3", connection_method: "cloud_mt5" },
      { id: "4", connection_method: "alpaca_live" },
    ];
    const gate = canConnectLiveAccount({ plan: "pro", existingAccounts: above });
    assert.equal(gate.allowed, false);
    assert.equal(gate.used, 4);
    assert.equal(gate.cap, 3);
    // Reconnect of #4 still allowed
    const recon = canConnectLiveAccount({
      plan: "pro",
      existingAccounts: above,
      excludeAccountId: "4",
    });
    assert.equal(recon.allowed, true);
  });

  it("exposes clear connect-flow copy", () => {
    assert.equal(liveAccountsIncludedNotice("free"), "Your plan includes 1 live account.");
    assert.equal(liveAccountsIncludedNotice("pro"), "Your plan includes 3 live accounts.");
    assert.match(liveAccountCapMessage({ plan: "founder", cap: 5, used: 5 }), /Founder/);
  });
});

describe("chat daily limits", () => {
  it("enforces Free 20, Pro 200, Founder/Elite 500; exempt unlimited", () => {
    assert.equal(enforcedDailyChatLimit("free"), 20);
    assert.equal(enforcedDailyChatLimit("pro"), 200);
    assert.equal(enforcedDailyChatLimit("founder"), 500);
    assert.equal(enforcedDailyChatLimit("elite"), 500);
    assert.equal(enforcedDailyChatLimit("free", true), -1);
  });

  it("uses UTC day boundary", () => {
    assert.equal(CHAT_QUOTA_TIMEZONE, "UTC");
    const iso = nextUtcMidnightIso(new Date("2026-10-29T15:00:00.000Z"));
    assert.equal(iso, "2026-10-30T00:00:00.000Z");
  });

  it("friendly notice mentions reset and upgrade only for free", () => {
    const free = chatQuotaFriendlyNotice({ plan: "free", limit: 20 });
    assert.match(free, /20 free/);
    assert.match(free, /midnight UTC/);
    assert.match(free, /Upgrade/);
    assert.equal(shouldOfferChatUpgrade("free"), true);

    const pro = chatQuotaFriendlyNotice({ plan: "pro", limit: 200 });
    assert.match(pro, /Pro/);
    assert.match(pro, /200/);
    assert.match(pro, /midnight UTC/);
    assert.equal(shouldOfferChatUpgrade("pro"), false);
  });
});
