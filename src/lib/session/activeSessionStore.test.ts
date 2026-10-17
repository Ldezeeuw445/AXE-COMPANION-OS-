import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  DEFAULT_ACTIVE_SESSION,
  SESSION_COOKIE,
  formatSessionCookie,
  mergeActiveSession,
  parseActiveSession,
  pathForTab,
  readCookieValue,
  sanitizeActiveSession,
  sessionFromCookieHeader,
  tabFromPathname,
} from "./activeSession";
import {
  getActiveSession,
  getActiveSessionServerSnapshot,
  hydrateActiveSession,
  patchActiveSession,
  prepareActiveSession,
  resetActiveSessionForTests,
} from "./activeSessionStore";
import { accountTypeFromBroker, accountTypeFromKind } from "./accountType";

describe("activeSession parse / sanitize", () => {
  afterEach(() => {
    resetActiveSessionForTests();
  });

  it("fills defaults for empty input", () => {
    assert.deepEqual(sanitizeActiveSession({}), DEFAULT_ACTIVE_SESSION);
  });

  it("normalizes symbol and timeframe aliases", () => {
    const next = sanitizeActiveSession({ symbol: " xauusd ", timeframe: "1h" });
    assert.equal(next.symbol, "XAUUSD");
    assert.equal(next.timeframe, "h1");
  });

  it("rejects unknown tabs and account types", () => {
    const next = sanitizeActiveSession({
      lastTab: "settings" as never,
      accountType: "paper" as never,
    });
    assert.equal(next.lastTab, "axe");
    assert.equal(next.accountType, "unknown");
  });

  it("round-trips JSON and URI-encoded cookies", () => {
    const state = sanitizeActiveSession({
      userId: "user-1",
      accountId: "acct-9",
      accountType: "funded",
      accountLabel: "FTMO Funded",
      symbol: "EURUSD",
      timeframe: "m15",
      lastTab: "chart",
    });
    const cookie = formatSessionCookie(state);
    const raw = readCookieValue(cookie, SESSION_COOKIE);
    assert.deepEqual(parseActiveSession(raw), state);
    assert.deepEqual(sessionFromCookieHeader(cookie), state);
  });

  it("maps the five shell tabs from pathnames", () => {
    assert.equal(tabFromPathname("/cockpit"), "home");
    assert.equal(tabFromPathname("/watchlist"), "markets");
    assert.equal(tabFromPathname("/market"), "markets");
    assert.equal(tabFromPathname("/chart"), "chart");
    assert.equal(tabFromPathname("/chat"), "axe");
    assert.equal(tabFromPathname("/accounts"), "account");
    assert.equal(tabFromPathname("/settings"), null);
    assert.equal(pathForTab("home"), "/cockpit");
    assert.equal(pathForTab("markets"), "/watchlist");
  });

  it("merges a patch without dropping the rest of the session", () => {
    const current = sanitizeActiveSession({
      accountId: "a1",
      accountType: "live",
      symbol: "XAUUSD",
      timeframe: "h1",
      lastTab: "axe",
    });
    const next = mergeActiveSession(current, { symbol: "EURUSD", lastTab: "markets" });
    assert.equal(next.accountId, "a1");
    assert.equal(next.accountType, "live");
    assert.equal(next.symbol, "EURUSD");
    assert.equal(next.lastTab, "markets");
    assert.equal(next.timeframe, "h1");
  });
});

describe("accountType mapping", () => {
  it("maps profile kinds onto the shell account types", () => {
    assert.equal(accountTypeFromKind("live"), "live");
    assert.equal(accountTypeFromKind("demo"), "demo");
    assert.equal(accountTypeFromKind("prop_evaluation"), "prop");
    assert.equal(accountTypeFromKind("prop_funded"), "funded");
    assert.equal(accountTypeFromKind("unknown"), "unknown");
  });

  it("treats demo_paper as demo and funded labels as funded", () => {
    assert.equal(accountTypeFromBroker({ connectionMethod: "demo_paper", label: "Paper" }), "demo");
    assert.equal(accountTypeFromBroker({ label: "FTMO Funded" }), "funded");
    assert.equal(accountTypeFromBroker({ label: "FTMO Challenge" }), "prop");
    assert.equal(accountTypeFromBroker({ label: "IC Markets Live" }), "live");
  });
});

describe("activeSessionStore", () => {
  afterEach(() => {
    resetActiveSessionForTests();
  });

  it("hydrates once from the server snapshot and keeps getServerSnapshot in sync", () => {
    const snapshot = sanitizeActiveSession({
      accountId: "acct-1",
      accountType: "live",
      symbol: "GBPJPY",
      timeframe: "h4",
      lastTab: "chart",
    });
    hydrateActiveSession(snapshot);
    assert.deepEqual(getActiveSession(), snapshot);
    assert.deepEqual(getActiveSessionServerSnapshot(), snapshot);
  });

  it("prepare does not overwrite a later client patch on remount", () => {
    prepareActiveSession(DEFAULT_ACTIVE_SESSION);
    patchActiveSession({ symbol: "NAS100", lastTab: "markets", accountType: "prop" });
    prepareActiveSession(DEFAULT_ACTIVE_SESSION);
    const next = getActiveSession();
    assert.equal(next.symbol, "NAS100");
    assert.equal(next.lastTab, "markets");
    assert.equal(next.accountType, "prop");
  });

  it("patches persist across a simulated reload via parse", () => {
    hydrateActiveSession(
      sanitizeActiveSession({
        accountId: "acct-2",
        accountType: "demo",
        accountLabel: "AXE Demo",
        symbol: "XAUUSD",
        timeframe: "h1",
        lastTab: "home",
      }),
    );
    const afterNav = patchActiveSession({ symbol: "BTCUSD", timeframe: "m5", lastTab: "chart" });
    resetActiveSessionForTests();
    hydrateActiveSession(parseActiveSession(JSON.stringify(afterNav)) ?? DEFAULT_ACTIVE_SESSION);
    const reloaded = getActiveSession();
    assert.equal(reloaded.accountId, "acct-2");
    assert.equal(reloaded.accountType, "demo");
    assert.equal(reloaded.symbol, "BTCUSD");
    assert.equal(reloaded.timeframe, "m5");
    assert.equal(reloaded.lastTab, "chart");
  });
});
