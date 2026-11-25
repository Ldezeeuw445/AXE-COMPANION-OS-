import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  bridgeQuoteTargets,
  bridgeSnapshotRow,
  parseBridgePrice,
  runBridgeQuoteLoop,
  shouldWrite,
  type BridgePrice,
} from "./bridgeQuotes";

// What the sync stored on Luka's Upcomers account on 25 Nov 2026, before #218
// dropped the two bad oil mappings.
const UPCOMERS_META = {
  metaapiRegion: "bridge",
  mt5_quotes_symbols: ["UKOIL.c", "USOIL.c", "XAUUSD"],
  openPositions: [{ id: "27449642", symbol: "XAUUSD", side: "sell" }],
  symbol_map: {
    BRENT: "UKOIL.c",
    WTI: "USOIL.c",
    XAUUSD: "XAUUSD",
    EURUSD: "EURUSD",
    BTCUSD: "BTCUSD.nx",
    UKOUSD: "KO",
    USOUSD: "D",
  },
};

describe("bridgeQuoteTargets", () => {
  it("puts the watchlist and open positions first and names each symbol once", () => {
    const targets = bridgeQuoteTargets(UPCOMERS_META);
    assert.deepEqual(
      targets.map((t) => [t.display, t.broker, t.fast]),
      [
        ["BRENT", "UKOIL.c", true],
        ["WTI", "USOIL.c", true],
        ["XAUUSD", "XAUUSD", true],
        ["EURUSD", "EURUSD", false],
        ["BTCUSD", "BTCUSD.nx", false],
      ],
    );
  });

  it("never polls a mapping to another instrument (KO for UKOUSD)", () => {
    const brokers = bridgeQuoteTargets(UPCOMERS_META).map((t) => t.broker);
    assert.ok(!brokers.includes("KO"));
    assert.ok(!brokers.includes("D"));
  });

  it("is empty without metadata and respects the limit", () => {
    assert.deepEqual(bridgeQuoteTargets(null), []);
    assert.equal(bridgeQuoteTargets(UPCOMERS_META, 2).length, 2);
  });
});

describe("prices and rows", () => {
  it("reads the bridge's current-price answer", () => {
    assert.deepEqual(parseBridgePrice({ symbol: "EURUSD", bid: 1.0987, ask: 1.09871, time: "2026-11-25T19:10:00.860Z" }), {
      bid: 1.0987,
      ask: 1.09871,
      time: "2026-11-25T19:10:00.860Z",
    });
    assert.equal(parseBridgePrice({ bid: 0, ask: null }), null);
    assert.equal(parseBridgePrice("nope"), null);
    assert.equal(parseBridgePrice({ bid: 1.1, time: "not a time" })?.time, null);
  });

  it("writes the same row shape as the MetaApi streamer", () => {
    const row = bridgeSnapshotRow({
      userId: "u1",
      accountId: "a1",
      target: { display: "BRENT", broker: "UKOIL.c", fast: true },
      price: { bid: 93.3, ask: 93.355, time: "2026-11-25T19:31:18.837Z" },
      nowIso: "2026-11-25T19:31:20.000Z",
    });
    assert.deepEqual(row, {
      user_id: "u1",
      account_id: "a1",
      display_symbol: "BRENT",
      broker_symbol: "UKOIL.c",
      timeframe: "quote",
      last_price: 93.3,
      last_bid: 93.3,
      last_ask: 93.355,
      last_tick_at: "2026-11-25T19:31:18.837Z",
      status: "live",
      source: "mt5_bridge",
      updated_at: "2026-11-25T19:31:20.000Z",
    });
  });

  it("writes a price again only when it moved, or as a heartbeat", () => {
    const p: BridgePrice = { bid: 1, ask: 1.1, time: "t1" };
    assert.equal(shouldWrite(undefined, p, 0, 30_000), true);
    assert.equal(shouldWrite({ ...p, at: 0 }, p, 10_000, 30_000), false);
    assert.equal(shouldWrite({ ...p, at: 0 }, { ...p, bid: 1.01 }, 10_000, 30_000), true);
    assert.equal(shouldWrite({ ...p, at: 0 }, p, 30_000, 30_000), true);
  });
});

type Upsert = { rows: Array<Record<string, unknown>>; onConflict: string };

function fakeDb(accounts: Array<Record<string, unknown>>) {
  const upserts: Upsert[] = [];
  const db = {
    from(table: string) {
      if (table === "user_broker_accounts") {
        const filters: Record<string, unknown> = {};
        const chain = {
          select: () => chain,
          eq: (col: string, val: unknown) => {
            filters[col] = val;
            return chain;
          },
          then: (resolve: (v: unknown) => void) =>
            resolve({
              data: accounts.filter((a) => Object.entries(filters).every(([k, v]) => a[k] === v)),
              error: null,
            }),
        };
        return chain;
      }
      if (table === "chart_live_snapshots") {
        return {
          upsert: async (rows: Array<Record<string, unknown>>, opts: { onConflict: string }) => {
            upserts.push({ rows, onConflict: opts.onConflict });
            return { error: null };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return { db: db as never, upserts };
}

describe("runBridgeQuoteLoop", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.MT5_BRIDGE_URL = "https://bridge.test";
    process.env.MT5_BRIDGE_TOKEN = "t";
    process.env.MT5_BRIDGE_ACCOUNT_ID = "upcomers-12347717";
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  const account = {
    id: "3f38709a-f2f2-40e4-abf1-172e38999498",
    user_id: "acff7a12-1111-481d-a7a9-cc07583b8069",
    connection_method: "cloud_mt5",
    external_connection_id: "upcomers-12347717",
    status: "active",
    metadata: UPCOMERS_META,
  };

  function clock() {
    let t = 0;
    return { now: () => t, sleep: async (ms: number) => void (t += ms), tick: (ms: number) => void (t += ms) };
  }

  it("polls the bridge and writes changed prices; the slow symbols ride along every fifth cycle", async () => {
    const { db, upserts } = fakeDb([account]);
    const c = clock();
    const asked: string[][] = [];
    let cycle: string[] = [];
    let n = 0;
    const summary = await runBridgeQuoteLoop(db, {
      durationMs: 18_000,
      fastMs: 3_000,
      slowEvery: 5,
      heartbeatMs: 60_000,
      now: c.now,
      sleep: async (ms) => {
        asked.push(cycle);
        cycle = [];
        await c.sleep(ms);
      },
      fetchPrice: async (_cfg, broker) => {
        cycle.push(broker);
        n += 1;
        // XAUUSD moves every cycle, the rest stand still.
        return broker === "XAUUSD" ? { bid: 4369 + n, ask: 4369.3 + n, time: `t${n}` } : { bid: 93.3, ask: 93.35, time: "fixed" };
      },
    });
    asked.push(cycle);

    assert.equal(summary.ok, true);
    assert.equal(summary.accounts, 1);
    assert.equal(summary.symbols, 5);
    assert.equal(summary.cycles, 6);
    assert.deepEqual(asked[0]?.sort(), ["BTCUSD.nx", "EURUSD", "UKOIL.c", "USOIL.c", "XAUUSD"]);
    assert.deepEqual(asked[1]?.sort(), ["UKOIL.c", "USOIL.c", "XAUUSD"]);
    assert.deepEqual(asked[5]?.sort(), ["BTCUSD.nx", "EURUSD", "UKOIL.c", "USOIL.c", "XAUUSD"]);
    // First cycle writes all five; after that only the moving XAUUSD.
    assert.equal(upserts[0]?.rows.length, 5);
    assert.deepEqual(upserts.slice(1).map((u) => u.rows.map((r) => r.display_symbol)), [["XAUUSD"], ["XAUUSD"], ["XAUUSD"], ["XAUUSD"], ["XAUUSD"]]);
    assert.equal(upserts[0]?.onConflict, "user_id,account_id,display_symbol,timeframe");
    assert.equal(summary.written, 10);
  });

  it("stops asking after three cycles without one answer", async () => {
    const { db, upserts } = fakeDb([account]);
    const c = clock();
    const summary = await runBridgeQuoteLoop(db, {
      durationMs: 55_000,
      now: c.now,
      sleep: c.sleep,
      fetchPrice: async () => {
        throw new Error("bridge price 504");
      },
    });
    assert.equal(summary.cycles, 3);
    assert.equal(summary.stoppedEarly, "bridge_not_answering");
    assert.equal(summary.lastError, "bridge price 504");
    assert.equal(upserts.length, 0);
  });

  it("does nothing for accounts that are not on the bridge, or without the bridge", async () => {
    const onMetaApi = { ...account, metadata: { ...UPCOMERS_META, metaapiRegion: "london" } };
    const { db } = fakeDb([onMetaApi]);
    const c = clock();
    const summary = await runBridgeQuoteLoop(db, { now: c.now, sleep: c.sleep, fetchPrice: async () => null });
    assert.equal(summary.reason, "no_bridge_accounts");
    assert.equal(summary.cycles, 0);

    delete process.env.MT5_BRIDGE_URL;
    const off = await runBridgeQuoteLoop(fakeDb([account]).db, { now: c.now, sleep: c.sleep });
    assert.deepEqual([off.ok, off.reason], [false, "bridge_not_configured"]);
  });
});
