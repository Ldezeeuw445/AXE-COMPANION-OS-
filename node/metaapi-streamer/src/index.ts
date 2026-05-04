/**
 * AXE Companion — MetaApi MT5 streaming service.
 *
 * Subscribes to broker price/quote/candle/positions changes via the official
 * `metaapi.cloud-sdk` socket.io SDK and pushes normalized events to the
 * Cloudflare ChartLiveRoom Durable Object. The frontend keeps its existing
 * websocket contract.
 *
 * Designed for a long-lived Node process (Railway / Fly / Render / a tiny
 * Docker host). Multiple subscriptions per process are supported.
 *
 * NOTE: `metaapi.cloud-sdk` is a Node-only package; that is exactly why this
 * service exists outside the Cloudflare Worker runtime.
 */

import { publishEvent } from "./publish.js";
import { parseSubscriptions } from "./parseSubscriptions.js";
import {
  TF_MAP,
  roomKey,
  type ChartLiveEvent,
  type LivePositionPayload,
  type Subscription,
} from "./types.js";

type Env = {
  METAAPI_TOKEN: string;
  METAAPI_REGION: string;
  WORKER_URL: string;
  STREAMER_SECRET: string;
  SUBSCRIPTIONS: string;
  LOG_LEVEL: string;
};

function readEnv(): Env {
  const e: Env = {
    METAAPI_TOKEN: process.env.METAAPI_TOKEN ?? "",
    METAAPI_REGION: process.env.METAAPI_REGION ?? "london",
    WORKER_URL: process.env.WORKER_URL ?? "",
    STREAMER_SECRET: process.env.STREAMER_SECRET ?? "",
    SUBSCRIPTIONS: process.env.SUBSCRIPTIONS ?? "",
    LOG_LEVEL: process.env.LOG_LEVEL ?? "info",
  };
  for (const k of ["METAAPI_TOKEN", "WORKER_URL", "STREAMER_SECRET"] as const) {
    if (!e[k]) {
      throw new Error(`Missing required env: ${k}`);
    }
  }
  return e;
}

function log(level: "error" | "warn" | "info" | "debug", msg: string, ...rest: unknown[]) {
  const order = { error: 0, warn: 1, info: 2, debug: 3 } as const;
  const want = (process.env.LOG_LEVEL ?? "info") as keyof typeof order;
  if (order[level] > order[want]) return;
  const prefix = `[streamer ${new Date().toISOString()}] ${level.toUpperCase()}:`;
  // eslint-disable-next-line no-console
  console[level === "debug" ? "log" : level](prefix, msg, ...rest);
}

function mapSide(t: string | undefined): "buy" | "sell" {
  return (t ?? "").toUpperCase().includes("BUY") ? "buy" : "sell";
}

function broadcastReady(env: Env, sub: Subscription): Promise<boolean> {
  const evt: ChartLiveEvent = {
    type: "ready",
    userId: sub.userId,
    accountId: sub.accountId,
    displaySymbol: sub.displaySymbol,
    brokerSymbol: sub.brokerSymbol,
    timeframe: TF_MAP[sub.timeframe] ?? "1h",
    source: "metaapi_mt5",
  };
  return publishEvent(
    { workerUrl: env.WORKER_URL, streamerSecret: env.STREAMER_SECRET },
    roomKey(sub),
    evt,
  );
}

function broadcastStatus(env: Env, sub: Subscription, status: "live" | "delayed" | "reconnecting" | "offline" | "error", reason?: string): Promise<boolean> {
  const evt: ChartLiveEvent = { type: "live_status", status, reason };
  return publishEvent(
    { workerUrl: env.WORKER_URL, streamerSecret: env.STREAMER_SECRET },
    roomKey(sub),
    evt,
  );
}

async function startSubscription(env: Env, sub: Subscription) {
  log("info", `subscribing ${sub.displaySymbol} (${sub.brokerSymbol}) ${sub.timeframe} on ${sub.metaApiAccountId}`);

  // Lazy import keeps the SDK out of the bundle when this service is built but
  // never actually started (e.g. CI typecheck without runtime install).
  const sdkMod = (await import("metaapi.cloud-sdk")) as unknown as {
    default: new (token: string, opts?: { region?: string }) => MetaApiInstance;
  };
  const MetaApi = sdkMod.default;
  const api = new MetaApi(env.METAAPI_TOKEN, { region: env.METAAPI_REGION });

  const account = await api.metatraderAccountApi.getAccount(sub.metaApiAccountId);
  if (account.state !== "DEPLOYED") {
    log("info", `deploying account ${sub.metaApiAccountId}`);
    await account.deploy();
  }
  await account.waitConnected();

  const connection = account.getStreamingConnection();
  await connection.connect();
  await connection.waitSynchronized();

  await connection.subscribeToMarketData(sub.brokerSymbol);

  const listener = new ChartListener(env, sub);
  connection.addSynchronizationListener(listener as unknown as Record<string, unknown>);

  await broadcastReady(env, sub);
  await broadcastStatus(env, sub, "live");

  return { account, connection, listener };
}

interface MetaApiInstance {
  metatraderAccountApi: {
    getAccount: (id: string) => Promise<{
      state: string;
      deploy: () => Promise<void>;
      waitConnected: () => Promise<void>;
      getStreamingConnection: () => StreamingConnection;
    }>;
  };
}

interface StreamingConnection {
  connect: () => Promise<void>;
  waitSynchronized: () => Promise<void>;
  subscribeToMarketData: (symbol: string) => Promise<void>;
  addSynchronizationListener: (listener: Record<string, unknown>) => void;
}

type SymbolPriceEvent = {
  symbol?: string;
  bid?: number;
  ask?: number;
  brokerTime?: string;
  time?: string;
};

type CandleEvent = {
  symbol?: string;
  timeframe?: string;
  time?: string;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  tickVolume?: number;
  volume?: number;
};

type PositionEvent = Record<string, unknown>;

class ChartListener {
  constructor(
    private readonly env: Env,
    private readonly sub: Subscription,
  ) {}

  // SDK may call any subset of these. We forward what we care about.
  async onSymbolPriceUpdated(_account: unknown, price: SymbolPriceEvent) {
    if (!price || price.symbol !== this.sub.brokerSymbol) return;
    const mid =
      price.bid != null && price.ask != null
        ? (price.bid + price.ask) / 2
        : (price.bid ?? price.ask ?? null);
    const evt: ChartLiveEvent = {
      type: "tick",
      userId: this.sub.userId,
      accountId: this.sub.accountId,
      displaySymbol: this.sub.displaySymbol,
      brokerSymbol: this.sub.brokerSymbol,
      bid: price.bid ?? null,
      ask: price.ask ?? null,
      price: mid != null ? Number(mid) : null,
      timestamp: price.brokerTime ?? price.time ?? null,
      source: "metaapi_mt5",
    };
    void publishEvent(
      { workerUrl: this.env.WORKER_URL, streamerSecret: this.env.STREAMER_SECRET },
      roomKey(this.sub),
      evt,
    );
  }

  async onCandlesUpdated(_account: unknown, candles: CandleEvent[]) {
    if (!Array.isArray(candles)) return;
    const wantTf = TF_MAP[this.sub.timeframe] ?? "1h";
    for (const c of candles) {
      if (c.symbol !== this.sub.brokerSymbol) continue;
      if (c.timeframe && c.timeframe !== wantTf) continue;
      const evt: ChartLiveEvent = {
        type: "candle_update",
        userId: this.sub.userId,
        accountId: this.sub.accountId,
        displaySymbol: this.sub.displaySymbol,
        brokerSymbol: this.sub.brokerSymbol,
        timeframe: wantTf,
        candle: {
          time: String(c.time ?? ""),
          open: Number(c.open ?? 0),
          high: Number(c.high ?? 0),
          low: Number(c.low ?? 0),
          close: Number(c.close ?? 0),
          volume: c.tickVolume ?? c.volume,
        },
        patch: true,
        source: "metaapi_mt5",
      };
      void publishEvent(
        { workerUrl: this.env.WORKER_URL, streamerSecret: this.env.STREAMER_SECRET },
        roomKey(this.sub),
        evt,
      );
    }
  }

  async onPositionsUpdated(_account: unknown, positions: PositionEvent[]) {
    const arr = Array.isArray(positions) ? positions : [];
    const onSymbol: LivePositionPayload[] = arr
      .filter((p) => String(p.symbol ?? "") === this.sub.brokerSymbol)
      .map((p, i) => ({
        id: String(p.id ?? p.positionId ?? i),
        symbol: String(p.symbol ?? ""),
        side: mapSide(typeof p.type === "string" ? (p.type as string) : undefined),
        volume: Number(p.volume ?? 0) || 0,
        entryPrice: p.openPrice != null ? Number(p.openPrice) : null,
        currentPrice:
          p.currentPrice != null
            ? Number(p.currentPrice)
            : p.price != null
              ? Number(p.price)
              : null,
        profit:
          p.profit != null
            ? Number(p.profit)
            : p.unrealizedProfit != null
              ? Number(p.unrealizedProfit)
              : null,
        stopLoss: p.stopLoss != null ? Number(p.stopLoss) : null,
        takeProfit: p.takeProfit != null ? Number(p.takeProfit) : null,
        openTime: (p.time as string) ?? (p.updateTime as string) ?? null,
      }));
    const evt: ChartLiveEvent = {
      type: "positions_update",
      userId: this.sub.userId,
      accountId: this.sub.accountId,
      total: arr.length,
      onSymbol,
      source: "metaapi_mt5",
    };
    void publishEvent(
      { workerUrl: this.env.WORKER_URL, streamerSecret: this.env.STREAMER_SECRET },
      roomKey(this.sub),
      evt,
    );
  }

  async onConnected() {
    await broadcastStatus(this.env, this.sub, "live");
  }

  async onDisconnected() {
    await broadcastStatus(this.env, this.sub, "reconnecting");
  }
}

async function main() {
  const env = readEnv();
  const subs = parseSubscriptions(env.SUBSCRIPTIONS);
  if (subs.length === 0) {
    log("warn", "no SUBSCRIPTIONS configured — process will idle");
  } else {
    log("info", `loaded ${subs.length} subscription(s)`);
  }

  for (const sub of subs) {
    try {
      await startSubscription(env, sub);
    } catch (e) {
      log("error", `failed to start ${roomKey(sub)}:`, e);
      await broadcastStatus(env, sub, "error", "subscription_failed");
    }
  }

  process.on("SIGTERM", () => {
    log("info", "SIGTERM received — flushing");
    process.exit(0);
  });
  process.on("SIGINT", () => {
    log("info", "SIGINT received — flushing");
    process.exit(0);
  });
}

main().catch((err) => {
  log("error", "fatal:", err);
  process.exit(1);
});
