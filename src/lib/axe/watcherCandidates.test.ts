import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  collectWatcherCandidates,
  isAnnounceableTradeClose,
  rotateList,
  tradeCloseEventKey,
  TRADE_CLOSE_LOOKBACK_MS,
} from "./watcherCandidates";

describe("collectWatcherCandidates", () => {
  it("does not let idle connected accounts crowd out people who just traded", () => {
    const idle = Array.from({ length: 40 }, (_, i) => `idle-${i}`);
    const picked = collectWatcherCandidates(
      {
        recentTradeUserIds: ["trader-1"],
        pendingExecUserIds: ["pending-1"],
        openPositionUserIds: ["open-1"],
        staleConnectionUserIds: ["stale-1"],
        activeAccountUserIds: idle,
        pushUserIds: [],
        nowMs: 0,
      },
      6,
    );
    assert.deepEqual(picked.slice(0, 4), ["trader-1", "pending-1", "open-1", "stale-1"]);
    assert.equal(picked.length, 6);
    assert.ok(!picked.includes("idle-0") || picked.indexOf("trader-1") < picked.indexOf("idle-0"));
  });

  it("still fills the cap from connected accounts when nobody is active", () => {
    const picked = collectWatcherCandidates(
      {
        recentTradeUserIds: [],
        pendingExecUserIds: [],
        openPositionUserIds: [],
        staleConnectionUserIds: [],
        activeAccountUserIds: ["a", "b", "c"],
        pushUserIds: ["p"],
        nowMs: 0,
      },
      2,
    );
    assert.equal(picked.length, 2);
    assert.ok(picked.includes("a") || picked.includes("b") || picked.includes("c"));
    assert.ok(!picked.includes("p") || picked.length === 2);
  });
});

describe("tradeCloseEventKey", () => {
  it("prefers the stable MetaApi id so a re-import does not re-announce", () => {
    assert.equal(
      tradeCloseEventKey({ id: "uuid-1", external_trade_id: "metaapi:22879001" }),
      "trade_close:metaapi:22879001",
    );
    assert.equal(tradeCloseEventKey({ id: "uuid-1", external_trade_id: "  " }), "trade_close:uuid-1");
  });
});

describe("rotateList", () => {
  it("walks past the first page on the next 15-minute slot", () => {
    const ids = ["0", "1", "2", "3", "4", "5"];
    const first = rotateList(ids, 0, 3);
    const next = rotateList(ids, 15 * 60 * 1000, 3);
    assert.deepEqual(first.slice(0, 3), ["0", "1", "2"]);
    assert.deepEqual(next.slice(0, 3), ["3", "4", "5"]);
  });
});

describe("TRADE_CLOSE_LOOKBACK_MS", () => {
  it("is wider than the 15-minute cron plus the 10-minute sync", () => {
    assert.ok(TRADE_CLOSE_LOOKBACK_MS >= 6 * 60 * 60 * 1000);
  });
});

describe("isAnnounceableTradeClose", () => {
  const now = Date.parse("2026-10-28T12:00:00.000Z");

  it("announces a trade that closed since the last sync", () => {
    assert.equal(isAnnounceableTradeClose("2026-10-28T11:50:00.000Z", now), true);
  });

  it("does not announce history pulled in by a first sync", () => {
    // 90 days of deals arrive at once; none of them is news.
    assert.equal(isAnnounceableTradeClose("2026-08-01T09:00:00.000Z", now), false);
    assert.equal(
      isAnnounceableTradeClose(new Date(now - TRADE_CLOSE_LOOKBACK_MS - 1).toISOString(), now),
      false,
    );
  });

  it("ignores a missing or unreadable close time", () => {
    assert.equal(isAnnounceableTradeClose(null, now), false);
    assert.equal(isAnnounceableTradeClose("not a date", now), false);
  });
});
