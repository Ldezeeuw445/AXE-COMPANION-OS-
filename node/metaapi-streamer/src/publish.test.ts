import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  ChartPublisher,
  PUBLISH_BACKOFF_INITIAL_MS,
  PUBLISH_BACKOFF_MAX_MS,
  PUBLISH_CIRCUIT_MS,
  PUBLISH_FLUSH_INTERVAL_MS,
  drainPublishStats,
  flushPublisher,
  publishEvent,
  resetPublisher,
  stopPublisher,
} from "./publish.js";
import type { ChartLiveEvent } from "./types.js";

const CFG = {
  workerUrl: "https://chart.example.com/",
  streamerSecret: "s3cret",
};

function tick(price: number): ChartLiveEvent {
  return {
    type: "tick",
    accountId: "acct",
    displaySymbol: "XAUUSD",
    brokerSymbol: "XAUUSDm",
    bid: price,
    ask: price + 0.1,
    price,
    timestamp: "2026-01-01T00:00:00.000Z",
    source: "metaapi_mt5",
  };
}

function positions(): ChartLiveEvent {
  return {
    type: "positions_update",
    accountId: "acct",
    total: 1,
    onSymbol: [
      {
        id: "1",
        symbol: "XAUUSDm",
        side: "buy",
        volume: 0.1,
        entryPrice: 2000,
        currentPrice: 2001,
        profit: 10,
        stopLoss: null,
        takeProfit: null,
        openTime: null,
      },
    ],
    source: "metaapi_mt5",
  };
}

type FetchCall = {
  url: string;
  method: string | undefined;
  headers: Record<string, string>;
  body: { roomKey?: string; event?: ChartLiveEvent };
};

function headerMap(headers: HeadersInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  new Headers(headers).forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });
  return out;
}

function createFetch(
  impl: (call: FetchCall) => { status: number; body?: string } | Promise<{ status: number; body?: string }>,
) {
  const calls: FetchCall[] = [];
  const fetchFn: typeof fetch = async (input, init) => {
    const call: FetchCall = {
      url: String(input),
      method: init?.method,
      headers: headerMap(init?.headers),
      body: init?.body ? (JSON.parse(String(init.body)) as FetchCall["body"]) : {},
    };
    calls.push(call);
    const res = await impl(call);
    return new Response(res.body ?? "", {
      status: res.status,
      headers: { "Content-Type": "text/plain" },
    });
  };
  return { fetchFn, calls };
}

function publisher(opts: {
  fetch: typeof fetch;
  now?: () => number;
  random?: () => number;
  log?: (level: "error" | "warn" | "info" | "debug", msg: string, ...rest: unknown[]) => void;
}) {
  return new ChartPublisher({
    fetch: opts.fetch,
    now: opts.now,
    random: opts.random ?? (() => 1),
    log: opts.log ?? (() => {}),
    autoFlush: false,
  });
}

afterEach(() => {
  resetPublisher();
});

describe("publish flush interval", () => {
  it("is between 250ms and 500ms", () => {
    assert.ok(PUBLISH_FLUSH_INTERVAL_MS >= 250);
    assert.ok(PUBLISH_FLUSH_INTERVAL_MS <= 500);
  });

  it("holds the circuit for 10 minutes", () => {
    assert.equal(PUBLISH_CIRCUIT_MS, 10 * 60 * 1000);
  });
});

describe("coalesced publish", () => {
  it("POSTs the latest event per roomKey on flush", async () => {
    const { fetchFn, calls } = createFetch(() => ({ status: 200, body: '{"ok":true}' }));
    const pub = publisher({ fetch: fetchFn });

    assert.equal(pub.publish(CFG, "room-a", tick(1)), true);
    assert.equal(pub.publish(CFG, "room-a", tick(2)), true);
    assert.equal(pub.publish(CFG, "room-b", tick(3)), true);
    assert.equal(calls.length, 0);

    await pub.flush();

    assert.equal(calls.length, 2);
    const byRoom = new Map(calls.map((c) => [c.body.roomKey, c]));
    assert.equal(byRoom.get("room-a")?.body.event?.type, "tick");
    assert.equal((byRoom.get("room-a")?.body.event as { price: number }).price, 2);
    assert.equal((byRoom.get("room-b")?.body.event as { price: number }).price, 3);
  });

  it("does not let a later tick clobber a positions_update on the same room", async () => {
    const { fetchFn, calls } = createFetch(() => ({ status: 200 }));
    const pub = publisher({ fetch: fetchFn });

    pub.publish(CFG, "room-a", positions());
    pub.publish(CFG, "room-a", tick(42));
    await pub.flush();

    const types = calls.map((c) => c.body.event?.type).sort();
    assert.deepEqual(types, ["positions_update", "tick"]);
  });

  it("does not let a hung POST block a later flush of another room", async () => {
    let release!: () => void;
    const hung = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { fetchFn, calls } = createFetch(async (call) => {
      if (call.body.roomKey === "slow") await hung;
      return { status: 200 };
    });
    const pub = publisher({ fetch: fetchFn });

    pub.publish(CFG, "slow", tick(1));
    const slowFlush = pub.flush();
    pub.publish(CFG, "fast", tick(2));
    await pub.flush();

    assert.equal(
      calls.some((c) => c.body.roomKey === "fast"),
      true,
    );
    release();
    await slowFlush;
    assert.equal(calls.length, 2);
  });

  it("posts the Cloudflare/VPS contract: /internal/publish, secret header, {roomKey,event}", async () => {
    const { fetchFn, calls } = createFetch(() => ({ status: 200 }));
    const pub = publisher({ fetch: fetchFn });

    pub.publish(CFG, "u|a|XAUUSDm|h1", tick(1));
    await pub.flush();

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, "https://chart.example.com/internal/publish");
    assert.equal(calls[0]?.method, "POST");
    assert.equal(calls[0]?.headers["content-type"], "application/json");
    assert.equal(calls[0]?.headers["x-streamer-secret"], "s3cret");
    assert.equal(calls[0]?.body.roomKey, "u|a|XAUUSDm|h1");
    assert.equal(calls[0]?.body.event?.type, "tick");
  });
});

describe("circuit breaker", () => {
  for (const status of [401, 403, 503]) {
    it(`opens for 10 minutes on ${status}, logs once, and drops events`, async () => {
      let now = 1_000_000;
      let nextStatus = status;
      const logs: Array<[string, string]> = [];
      const { fetchFn, calls } = createFetch(() => ({ status: nextStatus, body: "forbidden" }));
      const pub = publisher({
        fetch: fetchFn,
        now: () => now,
        log: (level, msg) => logs.push([level, msg]),
      });

      assert.equal(pub.publish(CFG, "room-a", tick(1)), true);
      await pub.flush();
      assert.equal(calls.length, 1);

      const warn = logs.filter(([level]) => level === "warn");
      assert.equal(warn.length, 1);
      assert.match(warn[0]![1], /circuit/i);
      assert.match(warn[0]![1], new RegExp(String(status)));

      assert.equal(pub.getStats().circuitOpen, true);
      assert.equal(pub.publish(CFG, "room-a", tick(2)), false);
      await pub.flush();
      assert.equal(calls.length, 1);

      pub.publish(CFG, "room-b", tick(3));
      assert.equal(pub.drainStats().dropped >= 2, true);

      // still inside the window
      now += PUBLISH_CIRCUIT_MS - 1;
      assert.equal(pub.publish(CFG, "room-a", tick(4)), false);

      // another failure while open must not log again
      nextStatus = status;
      now += 1;
      assert.equal(pub.publish(CFG, "room-a", tick(5)), true);
      await pub.flush();
      // After the window, one attempt goes out. If it fails again, a new log is allowed.
      assert.equal(calls.length, 2);
      const warnsAfter = logs.filter(([level]) => level === "warn");
      assert.equal(warnsAfter.length, 2);
    });
  }
});

describe("exponential backoff", () => {
  it("backs off on 429, doubling from 1s up to 5 minutes with jitter, dropping events", async () => {
    let now = 5_000_000;
    const { fetchFn, calls } = createFetch(() => ({ status: 429, body: "rate limited" }));
    const pub = publisher({
      fetch: fetchFn,
      now: () => now,
      random: () => 1, // jitter multiplier = 1.0
    });

    assert.equal(PUBLISH_BACKOFF_INITIAL_MS, 1000);
    assert.equal(PUBLISH_BACKOFF_MAX_MS, 5 * 60 * 1000);

    pub.publish(CFG, "room-a", tick(1));
    await pub.flush();
    assert.equal(calls.length, 1);

    // 1s backoff
    assert.equal(pub.publish(CFG, "room-a", tick(2)), false);
    now += 999;
    assert.equal(pub.publish(CFG, "room-a", tick(3)), false);
    now += 1;
    assert.equal(pub.publish(CFG, "room-a", tick(4)), true);
    await pub.flush();
    assert.equal(calls.length, 2);

    // 2s backoff
    assert.equal(pub.publish(CFG, "room-a", tick(5)), false);
    now += 1999;
    assert.equal(pub.publish(CFG, "room-a", tick(6)), false);
    now += 1;
    assert.equal(pub.publish(CFG, "room-a", tick(7)), true);
    await pub.flush();
    assert.equal(calls.length, 3);

    // 4s backoff
    now += 4000;
    assert.equal(pub.publish(CFG, "room-a", tick(8)), true);
    await pub.flush();
    assert.equal(calls.length, 4);

    const stats = pub.drainStats();
    assert.ok(stats.failed >= 3);
    assert.ok(stats.dropped >= 1);
  });

  it("treats 5xx as backoff", async () => {
    let now = 1;
    const { fetchFn, calls } = createFetch(() => ({ status: 502, body: "bad gateway" }));
    const pub = publisher({ fetch: fetchFn, now: () => now });

    pub.publish(CFG, "room-a", tick(1));
    await pub.flush();
    assert.equal(pub.publish(CFG, "room-a", tick(2)), false);
    now += 1000;
    assert.equal(pub.publish(CFG, "room-a", tick(3)), true);
    assert.equal(calls.length, 1);
  });

  it("treats Cloudflare 1027 as backoff even when the status is 403", async () => {
    let now = 1;
    const html = `<!doctype html><title>error code: 1027</title><p>Cloudflare</p>`;
    const { fetchFn, calls } = createFetch(() => ({ status: 403, body: html }));
    const pub = publisher({ fetch: fetchFn, now: () => now });

    pub.publish(CFG, "room-a", tick(1));
    await pub.flush();
    assert.equal(calls.length, 1);
    // 1027 must not open the 10-minute circuit
    assert.equal(pub.getStats().circuitOpen, false);
    assert.equal(pub.publish(CFG, "room-a", tick(2)), false);
    now += 1000;
    assert.equal(pub.publish(CFG, "room-a", tick(3)), true);
  });

  it("caps backoff at 5 minutes", async () => {
    let now = 1;
    const { fetchFn } = createFetch(() => ({ status: 500, body: "err" }));
    const pub = publisher({ fetch: fetchFn, now: () => now, random: () => 1 });

    let delay = PUBLISH_BACKOFF_INITIAL_MS;
    for (let i = 0; i < 12; i++) {
      assert.equal(pub.publish(CFG, "room-a", tick(i)), true);
      await pub.flush();
      if (i < 11) {
        delay = Math.min(delay * 2, PUBLISH_BACKOFF_MAX_MS);
        now += delay;
      }
    }
    // After many failures the wait is still the 5-minute cap, not 2^n.
    assert.equal(pub.publish(CFG, "room-a", tick(99)), false);
    now += PUBLISH_BACKOFF_MAX_MS - 1;
    assert.equal(pub.publish(CFG, "room-a", tick(100)), false);
    now += 1;
    assert.equal(pub.publish(CFG, "room-a", tick(101)), true);
  });

  it("resets backoff after a successful publish", async () => {
    let now = 1;
    let status = 429;
    const { fetchFn } = createFetch(() => ({ status }));
    const pub = publisher({ fetch: fetchFn, now: () => now, random: () => 1 });

    pub.publish(CFG, "room-a", tick(1));
    await pub.flush();
    now += 1000;
    status = 200;
    pub.publish(CFG, "room-a", tick(2));
    await pub.flush();

    status = 429;
    pub.publish(CFG, "room-a", tick(3));
    await pub.flush();
    // Backoff should have reset to 1s, not continued at 2s.
    now += 1000;
    assert.equal(pub.publish(CFG, "room-a", tick(4)), true);
  });

  it("applies jitter so the sleep is not a round multiple when random < 1", async () => {
    let now = 1;
    const { fetchFn } = createFetch(() => ({ status: 429 }));
    const pub = publisher({
      fetch: fetchFn,
      now: () => now,
      random: () => 0, // 50% of base
    });

    pub.publish(CFG, "room-a", tick(1));
    await pub.flush();
    now += 499;
    assert.equal(pub.publish(CFG, "room-a", tick(2)), false);
    now += 1;
    assert.equal(pub.publish(CFG, "room-a", tick(3)), true);
  });
});

describe("module singleton used by index.ts", () => {
  it("counts dropped publishes on the shared publisher", async () => {
    let now = 10;
    const { fetchFn } = createFetch(() => ({ status: 401, body: "no" }));
    resetPublisher({
      fetch: fetchFn,
      now: () => now,
      autoFlush: false,
      random: () => 1,
      log: () => {},
    });

    assert.equal(publishEvent(CFG, "room-a", tick(1)), true);
    await flushPublisher();
    assert.equal(publishEvent(CFG, "room-a", tick(2)), false);
    const stats = drainPublishStats();
    assert.ok(stats.failed >= 1);
    assert.ok(stats.dropped >= 1);
    stopPublisher();
  });
});
