import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isAccountLiveSymbol,
  liveEquitySnapshotFromMetadata,
  nextLiveAccountState,
  positionsFromAccountMetadata,
  toMt5PositionRow,
} from "./liveAccountSnapshot";

describe("positionsFromAccountMetadata", () => {
  it("reads the openPositions blob sync already writes", () => {
    const positions = positionsFromAccountMetadata({
      openPositions: [{ id: "1", symbol: "XAUUSD", type: "POSITION_TYPE_BUY", volume: 0.2, openPrice: 2650, profit: -12 }],
    });
    assert.equal(positions.length, 1);
    assert.equal(positions[0].symbol, "XAUUSD");
    assert.equal(positions[0].side, "buy");
    assert.equal(positions[0].volume, 0.2);
  });

  it("returns empty when the watcher would otherwise query an empty mt5_positions table", () => {
    assert.deepEqual(positionsFromAccountMetadata({}), []);
    assert.deepEqual(positionsFromAccountMetadata(null), []);
  });
});

describe("toMt5PositionRow", () => {
  it("fills NOT NULL numeric columns so an upsert cannot bounce", () => {
    const row = toMt5PositionRow("u1", "a1", {
      id: "p1",
      symbol: "XAUUSD",
      side: "sell",
      volume: 1,
      entryPrice: null,
      currentPrice: null,
      profit: null,
      stopLoss: null,
      takeProfit: null,
      openTime: null,
    });
    assert.equal(row.type, "sell");
    assert.equal(row.open_price, 0);
    assert.equal(row.current_price, 0);
    assert.equal(row.profit, 0);
  });
});

describe("nextLiveAccountState", () => {
  it("anchors the UTC day on first tick and trails the peak", () => {
    const first = nextLiveAccountState({}, { balance: 100_000, equity: 99_000, margin: 1, freeMargin: 99, marginLevel: 1000, currency: "USD", profit: -1000 }, new Date("2026-10-28T08:00:00Z"));
    const live = first.liveAccountState as Record<string, unknown>;
    assert.equal(live.dayStartDate, "2026-10-28");
    assert.equal(live.dayStartBalance, 100_000);
    assert.equal(live.initialBalance, 100_000);

    const later = nextLiveAccountState(first, { balance: 101_000, equity: 101_500, margin: 1, freeMargin: 99, marginLevel: 1000, currency: "USD", profit: 1500 }, new Date("2026-10-28T18:00:00Z"));
    const live2 = later.liveAccountState as Record<string, unknown>;
    assert.equal(live2.dayStartBalance, 100_000);
    assert.equal(live2.peakBalance, 101_500);
  });
});

describe("liveEquitySnapshotFromMetadata", () => {
  it("prefers liveAccountState over the 10-minute sync summary", () => {
    const snap = liveEquitySnapshotFromMetadata(
      {
        accountSummary: { balance: 100_000, equity: 100_000 },
        liveAccountState: {
          balance: 98_000,
          equity: 97_000,
          dayStartBalance: 100_000,
          dayStartEquity: 100_000,
          initialBalance: 100_000,
          peakBalance: 100_000,
        },
      },
      { balance: 98_000, equity: 97_000, margin: null, freeMargin: null, marginLevel: null, currency: "USD", profit: -3000 },
    );
    assert.ok(snap);
    assert.equal(snap.equity, 97_000);
    assert.equal(snap.dayStartBalance, 100_000);
  });
});

describe("isAccountLiveSymbol", () => {
  it("recognises the positions-page subscription", () => {
    assert.equal(isAccountLiveSymbol("__account__"), true);
    assert.equal(isAccountLiveSymbol("__ACCOUNT__"), true);
    assert.equal(isAccountLiveSymbol("ACCOUNT"), true);
    assert.equal(isAccountLiveSymbol("XAUUSD"), false);
  });
});
