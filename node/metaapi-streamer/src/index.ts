import { publishEvent, getInflightCount } from "./publish.js";
import { SnapshotBuffer } from "./snapshotBuffer.js";
import {
  loadAccountConfigs,
  diffConfigs,
  RECONCILE_INTERVAL_MS,
} from "./subscriptionManager.js";
import { parseSubscriptions } from "./parseSubscriptions.js";
import {
  TF_MAP,
  ALL_TF_KEYS,
  roomKey,
  type ChartLiveEvent,
  type LivePositionPayload,
  type LivePendingOrderPayload,
  type AccountConfig,
} from "./types.js";

/* ------------------------------------------------------------------ */
/*  Environment                                                        */
/* ------------------------------------------------------------------ */

type Env = {
  METAAPI_TOKEN: string;
  WORKER_URL: string;
  STREAMER_SECRET: string;
  /** Optional legacy static subscriptions (v1 compat). */
  SUBSCRIPTIONS: string;
  /** Optional — if set, skip Supabase and use static subscriptions only. */
  STATIC_MODE: boolean;
  LOG_LEVEL: string;
};

function readEnv(): Env {
  const e: Env = {
    METAAPI_TOKEN: process.env.METAAPI_TOKEN ?? "",
    WORKER_URL: process.env.WORKER_URL ?? "",
    STREAMER_SECRET: process.env.STREAMER_SECRET ?? "",
    SUBSCRIPTIONS: process.env.SUBSCRIPTIONS ?? "",
    STATIC_MODE: (process.env.STATIC_MODE ?? "").toLowerCase() === "true",
    LOG_LEVEL: process.env.LOG_LEVEL ?? "info",
  };
  for (const k of ["METAAPI_TOKEN", "WORKER_URL", "STREAMER_SECRET"] as const) {
    if (!e[k]) {
      throw new Error(`Missing required env: ${k}`);
    }
  }
  return e;
}

/* ------------------------------------------------------------------ */
/*  Logging                                                            */
/* ------------------------------------------------------------------ */

function log(level: "error" | "warn" | "info" | "debug", msg: string, ...rest: unknown[]) {
  const order = { error: 0, warn: 1, info: 2, debug: 3 } as const;
  const want = (process.env.LOG_LEVEL ?? "info") as keyof typeof order;
  if (order[level] > order[want]) return;
  const prefix = `[streamer ${new Date().toISOString()}] ${level.toUpperCase()}:`;
  // eslint-disable-next-line no-console
  console[level === "debug" ? "log" : level](prefix, msg, ...rest);
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function mapSide(t: string | undefined): "buy" | "sell" {
  return (t ?? "").toUpperCase().includes("BUY") ? "buy" : "sell";
}

function mapOrderType(t: string | undefined): string {
  const raw = (t ?? "").toLowerCase();
  if (raw.includes("buy_limit")) return "buy_limit";
  if (raw.includes("sell_limit")) return "sell_limit";
  if (raw.includes("buy_stop")) return "buy_stop";
  if (raw.includes("sell_stop")) return "sell_stop";
  return raw || "unknown";
}

/* ------------------------------------------------------------------ */
/*  Per-account streaming manager                                      */
/* ------------------------------------------------------------------ */

type AccountStream = {
  config: AccountConfig;
  connection: StreamingConnection | null;
  subscribedSymbols: Set<string>;
  /** Display→broker lookup for this account. */
  symbolMap: Record<string, string>;
};

// Track all active account streams
const activeStreams = new Map<string, AccountStream>();
const startingStreams = new Set<string>();

function startHealthServer(): void {
  const port = Number(process.env.PORT ?? 8080);
  import("node:http").then(({ createServer }) => {
    createServer((req, res) => {
      if (req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            ok: true,
            streams: activeStreams.size,
            inflight: getInflightCount(),
          }),
        );
        return;
      }
      res.writeHead(404);
      res.end();
    }).listen(port, () => {
      log("info", `Health server listening on :${port}/health`);
    });
  });
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
  unsubscribeFromMarketData: (symbol: string) => Promise<void>;
  addSynchronizationListener: (listener: Record<string, unknown>) => void;
  close: () => Promise<void>;
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
type OrderEvent = Record<string, unknown>;

/* ------------------------------------------------------------------ */
/*  Broadcast helpers — fan out to all TF rooms                        */
/* ------------------------------------------------------------------ */

function broadcastToAllTfRooms(
  env: Env,
  config: AccountConfig,
  brokerSymbol: string,
  displaySymbol: string,
  buildEvent: (tf: string) => ChartLiveEvent
): void {
  for (const tfKey of ALL_TF_KEYS) {
    const key = `${config.userId}|${config.accountId}|${brokerSymbol}|${tfKey}`;
    void publishEvent(
      { workerUrl: env.WORKER_URL, streamerSecret: env.STREAMER_SECRET },
      key,
      buildEvent(TF_MAP[tfKey] ?? "1h")
    );
  }
}

/* ------------------------------------------------------------------ */
/*  SynchronizationListener (multi-symbol)                             */
/* ------------------------------------------------------------------ */

class MultiSymbolListener {
  /** Reverse map: broker symbol → display symbol */
  private brokerToDisplay: Map<string, string>;
  /** Snapshot buffer — persists latest prices to Supabase for the Quotes page */
  readonly snapshotBuffer: SnapshotBuffer;
  /** Tick throttle — max 1 broadcast per symbol per TICK_THROTTLE_MS */
  private lastTickBroadcast: Map<string, number> = new Map();
  private pendingOrdersById: Map<string, OrderEvent> = new Map();
  private pendingOrderTotal = 0;
  private static readonly TICK_THROTTLE_MS = 500; // max 2 ticks/sec/symbol

  constructor(
    private readonly env: Env,
    private readonly config: AccountConfig
  ) {
    this.brokerToDisplay = new Map();
    this.snapshotBuffer = new SnapshotBuffer(config.userId, config.accountId);
    this.rebuildReverseMap();
  }

  rebuildReverseMap(): void {
    this.brokerToDisplay.clear();
    for (const [display, broker] of Object.entries(this.config.symbolMap)) {
      this.brokerToDisplay.set(broker, display);
    }
    // Also add identity mappings for symbols not in the map
    for (const sym of this.config.watchlistSymbols) {
      const broker = this.config.symbolMap[sym] ?? sym;
      if (!this.brokerToDisplay.has(broker)) {
        this.brokerToDisplay.set(broker, sym);
      }
    }
  }

  private displayFor(brokerSymbol: string): string {
    return this.brokerToDisplay.get(brokerSymbol) ?? brokerSymbol;
  }

  // ── Tick events ──────────────────────────────────────────────────

  // SDK v29 calls BOTH singular and plural variants — implement both.

  /** Batch price update (SDK calls this for every tick batch) */
  async onSymbolPricesUpdated(
    _instanceIndex: unknown,
    prices: SymbolPriceEvent[],
    _equity?: unknown,
    _margin?: unknown,
    _freeMargin?: unknown,
    _marginLevel?: unknown,
    _accountCurrencyExchangeRate?: unknown
  ) {
    if (!Array.isArray(prices)) return;
    for (const p of prices) {
      await this.handlePriceTick(p);
    }
  }

  /** Single price update (legacy SDK callback) */
  async onSymbolPriceUpdated(_account: unknown, price: SymbolPriceEvent) {
    await this.handlePriceTick(price);
  }

  private async handlePriceTick(price: SymbolPriceEvent) {
    const broker = price?.symbol;
    if (!broker) return;
    const display = this.displayFor(broker);

    const mid =
      price.bid != null && price.ask != null
        ? (price.bid + price.ask) / 2
        : (price.bid ?? price.ask ?? null);

    // Always buffer for Supabase snapshot (Quotes page) — no throttle
    this.snapshotBuffer.record(
      display, broker,
      price.bid ?? null, price.ask ?? null,
      mid != null ? Number(mid) : null,
      price.brokerTime ?? price.time ?? null,
    );

    // Throttle CF Worker broadcasts to max 2/sec per symbol
    const now = Date.now();
    const lastBroadcast = this.lastTickBroadcast.get(broker) ?? 0;
    if (now - lastBroadcast < MultiSymbolListener.TICK_THROTTLE_MS) return;
    this.lastTickBroadcast.set(broker, now);

    broadcastToAllTfRooms(this.env, this.config, broker, display, () => ({
      type: "tick",
      userId: this.config.userId,
      accountId: this.config.accountId,
      displaySymbol: display,
      brokerSymbol: broker,
      bid: price.bid ?? null,
      ask: price.ask ?? null,
      price: mid != null ? Number(mid) : null,
      timestamp: price.brokerTime ?? price.time ?? null,
      source: "metaapi_mt5",
    }));
  }

  // ── Candle events ────────────────────────────────────────────────

  async onCandlesUpdated(_account: unknown, candles: CandleEvent[]) {
    if (!Array.isArray(candles)) return;

    for (const c of candles) {
      const broker = c.symbol;
      if (!broker) continue;
      const display = this.displayFor(broker);

      // Candle events have a specific timeframe — only broadcast to that room
      const candleTf = c.timeframe ?? "1h";
      // Find the tf key that matches
      const tfKey = Object.entries(TF_MAP).find(([, v]) => v === candleTf)?.[0] ?? "h1";

      const key = `${this.config.userId}|${this.config.accountId}|${broker}|${tfKey}`;
      const evt: ChartLiveEvent = {
        type: "candle_update",
        userId: this.config.userId,
        accountId: this.config.accountId,
        displaySymbol: display,
        brokerSymbol: broker,
        timeframe: candleTf,
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
        key,
        evt
      );
    }
  }

  // ── Position events ──────────────────────────────────────────────

  async onPositionsUpdated(_account: unknown, positions: PositionEvent[]) {
    const arr = Array.isArray(positions) ? positions : [];

    // Group positions by broker symbol
    const bySymbol = new Map<string, LivePositionPayload[]>();
    for (const p of arr) {
      const broker = String(p.symbol ?? "");
      if (!broker) continue;
      const list = bySymbol.get(broker) ?? [];
      list.push({
        id: String(p.id ?? p.positionId ?? ""),
        symbol: broker,
        side: mapSide(typeof p.type === "string" ? p.type : undefined),
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
      });
      bySymbol.set(broker, list);
    }

    // Broadcast to all rooms for symbols with positions
    for (const [broker, onSymbol] of bySymbol) {
      broadcastToAllTfRooms(this.env, this.config, broker, this.displayFor(broker), () => ({
        type: "positions_update",
        userId: this.config.userId,
        accountId: this.config.accountId,
        total: arr.length,
        onSymbol,
        source: "metaapi_mt5",
      }));
    }

    // Also broadcast to symbols WITHOUT positions (empty array = no positions on this symbol)
    for (const sym of this.config.watchlistSymbols) {
      const broker = this.config.symbolMap[sym] ?? sym;
      if (!bySymbol.has(broker)) {
        broadcastToAllTfRooms(this.env, this.config, broker, sym, () => ({
          type: "positions_update",
          userId: this.config.userId,
          accountId: this.config.accountId,
          total: arr.length,
          onSymbol: [],
          source: "metaapi_mt5",
        }));
      }
    }
  }

  // ── Pending order events ────────────────────────────────────────

  private pendingOrderKey(order: OrderEvent): string {
    return String(order.id ?? order.orderId ?? "");
  }

  private replacePendingOrderCache(orders: OrderEvent[]): void {
    this.pendingOrdersById.clear();
    this.pendingOrderTotal = orders.length;
    for (const order of orders) {
      const key = this.pendingOrderKey(order);
      if (key) this.pendingOrdersById.set(key, order);
    }
  }

  private rememberPendingOrder(order: OrderEvent): void {
    const key = this.pendingOrderKey(order);
    if (!key) {
      this.pendingOrderTotal = Math.max(this.pendingOrderTotal, 1);
      return;
    }
    const wasKnown = this.pendingOrdersById.has(key);
    this.pendingOrdersById.set(key, order);
    if (!wasKnown) this.pendingOrderTotal += 1;
    this.pendingOrderTotal = Math.max(this.pendingOrderTotal, this.pendingOrdersById.size);
  }

  private forgetPendingOrder(orderId: unknown): void {
    const key =
      typeof orderId === "string" || typeof orderId === "number" ? String(orderId) : "";
    if (key && this.pendingOrdersById.delete(key)) {
      this.pendingOrderTotal = Math.max(0, this.pendingOrderTotal - 1);
    }
  }

  private broadcastPendingOrders(orders: OrderEvent[], total?: number) {
    const arr = Array.isArray(orders) ? orders : [];
    const accountTotal = total ?? arr.length;

    // Group orders by broker symbol
    const bySymbol = new Map<string, LivePendingOrderPayload[]>();
    for (const o of arr) {
      const broker = String(o.symbol ?? "");
      if (!broker) continue;
      const list = bySymbol.get(broker) ?? [];
      list.push({
        id: String(o.id ?? o.orderId ?? ""),
        symbol: broker,
        type: mapOrderType(typeof o.type === "string" ? o.type : undefined),
        side: mapSide(typeof o.type === "string" ? o.type : undefined),
        volume: Number(o.volume ?? 0) || 0,
        openPrice: Number(o.openPrice ?? o.price ?? 0),
        currentPrice: o.currentPrice != null ? Number(o.currentPrice) : null,
        stopLoss: o.stopLoss != null ? Number(o.stopLoss) : null,
        takeProfit: o.takeProfit != null ? Number(o.takeProfit) : null,
        openTime: (o.time as string) ?? (o.updateTime as string) ?? null,
      });
      bySymbol.set(broker, list);
    }

    // Broadcast to rooms for symbols with orders
    for (const [broker, onSymbol] of bySymbol) {
      broadcastToAllTfRooms(this.env, this.config, broker, this.displayFor(broker), () => ({
        type: "orders_update",
        userId: this.config.userId,
        accountId: this.config.accountId,
        total: accountTotal,
        onSymbol,
        source: "metaapi_mt5",
      }));
    }
  }

  async onPendingOrdersUpdated(
    _account: unknown,
    orders: OrderEvent[],
    completedOrderIds?: unknown[]
  ) {
    const arr = Array.isArray(orders) ? orders : [];
    const completed = Array.isArray(completedOrderIds) ? completedOrderIds : [];
    for (const orderId of completed) this.forgetPendingOrder(orderId);
    for (const order of arr) this.rememberPendingOrder(order);
    this.broadcastPendingOrders(arr, this.pendingOrderTotal);
  }

  async onPendingOrderUpdated(_account: unknown, order: OrderEvent) {
    if (!order) return;
    this.rememberPendingOrder(order);
    this.broadcastPendingOrders([order], this.pendingOrderTotal);
  }

  async onPendingOrdersReplaced(_account: unknown, orders: OrderEvent[]) {
    const arr = Array.isArray(orders) ? orders : [];
    this.replacePendingOrderCache(arr);
    this.broadcastPendingOrders(arr);
  }

  async onPendingOrderCompleted(_account: unknown, orderId: unknown) {
    this.forgetPendingOrder(orderId);
  }

  // ── SDK v29 required callbacks (no-ops to suppress "not a function" errors) ─

  async onHealthStatus(..._a: unknown[]) { /* no-op */ }
  async onBrokerConnectionStatusChanged(..._a: unknown[]) { /* no-op */ }
  async onAccountInformationUpdated(..._a: unknown[]) { /* no-op */ }
  async onDealAdded(..._a: unknown[]) { /* no-op */ }
  async onDealSynchronizationFinished(..._a: unknown[]) { /* no-op */ }
  async onOrderSynchronizationFinished(..._a: unknown[]) { /* no-op */ }
  async onHistoryOrderAdded(..._a: unknown[]) { /* no-op */ }
  async onSymbolSpecificationUpdated(..._a: unknown[]) { /* no-op */ }
  async onSymbolSpecificationsUpdated(..._a: unknown[]) { /* no-op */ }
  async onPositionUpdated(..._a: unknown[]) { /* no-op */ }
  async onPositionRemoved(..._a: unknown[]) { /* no-op */ }
  async onPositionsReplaced(..._a: unknown[]) { /* no-op */ }
  async onPositionsSynchronized(..._a: unknown[]) { /* no-op */ }
  async onPendingOrdersSynchronized(..._a: unknown[]) { /* no-op */ }
  // Note: onSymbolPriceUpdated is defined above (delegates to handlePriceTick)
  async onDowngradeSubscription(..._a: unknown[]) { /* no-op */ }
  async onAccountsUpdated(..._a: unknown[]) { /* no-op */ }
  async onStreamClosed(..._a: unknown[]) { /* no-op */ }
  async onSynchronizationStarted(..._a: unknown[]) { /* no-op */ }

  // ── Connection lifecycle ────────────────────────────────────────

  async onConnected() {
    log("info", `[${this.config.metaApiAccountId}] MetaAPI connected`);
    // Broadcast "live" to all subscribed symbols
    for (const sym of this.config.watchlistSymbols) {
      const broker = this.config.symbolMap[sym] ?? sym;
      broadcastToAllTfRooms(this.env, this.config, broker, sym, () => ({
        type: "live_status",
        status: "live",
      }));
    }
  }

  async onDisconnected() {
    log("warn", `[${this.config.metaApiAccountId}] MetaAPI disconnected — will reconnect`);
    for (const sym of this.config.watchlistSymbols) {
      const broker = this.config.symbolMap[sym] ?? sym;
      broadcastToAllTfRooms(this.env, this.config, broker, sym, () => ({
        type: "live_status",
        status: "reconnecting",
        reason: "metaapi_disconnected",
      }));
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Account stream lifecycle                                           */
/* ------------------------------------------------------------------ */

let metaApiSingleton: MetaApiInstance | null = null;

async function getMetaApi(token: string, region: string): Promise<MetaApiInstance> {
  if (metaApiSingleton) return metaApiSingleton;
  // Use the Node.js ESM entry point — the default "import" export resolves
  // to esm-web which references `window` and crashes in Node.
  const sdkMod = (await import("metaapi.cloud-sdk/esm-node")) as unknown as {
    default: new (token: string, opts?: { region?: string }) => MetaApiInstance;
  };
  metaApiSingleton = new sdkMod.default(token, { region });
  return metaApiSingleton;
}

async function startAccountStream(env: Env, config: AccountConfig): Promise<AccountStream> {
  log("info", `Starting stream for account ${config.metaApiAccountId} with ${config.watchlistSymbols.length} symbols`);

  const api = await getMetaApi(env.METAAPI_TOKEN, config.region);
  const account = await api.metatraderAccountApi.getAccount(config.metaApiAccountId);

  if (account.state !== "DEPLOYED") {
    log("info", `Deploying account ${config.metaApiAccountId}`);
    await account.deploy();
  }

  // Wait for broker connection with timeout (don't block other accounts)
  const CONNECT_TIMEOUT_MS = 30_000;
  try {
    await Promise.race([
      account.waitConnected(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("waitConnected timed out after 30s")), CONNECT_TIMEOUT_MS)
      ),
    ]);
  } catch (e) {
    log("warn", `[${config.metaApiAccountId}] waitConnected timed out — proceeding anyway`);
  }

  const connection = account.getStreamingConnection();
  await connection.connect();

  // Wait for sync with timeout
  const SYNC_TIMEOUT_MS = 30_000;
  try {
    await Promise.race([
      connection.waitSynchronized(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("waitSynchronized timed out after 30s")), SYNC_TIMEOUT_MS)
      ),
    ]);
  } catch (e) {
    log("warn", `[${config.metaApiAccountId}] waitSynchronized timed out — proceeding with subscriptions`);
  }

  const rawListener = new MultiSymbolListener(env, config);

  // Wrap in Proxy: any SDK callback we haven't explicitly implemented
  // becomes an async no-op instead of crashing with "not a function".
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const listener = new Proxy(rawListener as any, {
    get(target: any, prop: string | symbol) {
      const val = target[prop];
      if (typeof val === "function") return val.bind(target);
      // Return async no-op for any unimplemented on* callback
      if (typeof prop === "string" && prop.startsWith("on")) {
        return async () => {};
      }
      return val;
    },
  }) as unknown as Record<string, unknown>;

  connection.addSynchronizationListener(listener);

  // Subscribe to ALL watchlist symbols
  const subscribedSymbols = new Set<string>();
  for (const displaySymbol of config.watchlistSymbols) {
    const brokerSymbol = config.symbolMap[displaySymbol] ?? displaySymbol;
    try {
      await connection.subscribeToMarketData(brokerSymbol);
      subscribedSymbols.add(brokerSymbol);
      log("debug", `  ✓ subscribed ${displaySymbol} → ${brokerSymbol}`);
    } catch (e) {
      log("warn", `  ✗ failed to subscribe ${displaySymbol} → ${brokerSymbol}:`, e);
    }
  }

  log("info", `Account ${config.metaApiAccountId}: ${subscribedSymbols.size}/${config.watchlistSymbols.length} symbols subscribed`);

  // Start snapshot buffer → flushes prices to Supabase every 3s for the Quotes page
  rawListener.snapshotBuffer.start();

  // Broadcast ready + live status for all subscribed symbols
  for (const displaySymbol of config.watchlistSymbols) {
    const brokerSymbol = config.symbolMap[displaySymbol] ?? displaySymbol;
    if (!subscribedSymbols.has(brokerSymbol)) continue;
    broadcastToAllTfRooms(env, config, brokerSymbol, displaySymbol, (tf) => ({
      type: "ready",
      userId: config.userId,
      accountId: config.accountId,
      displaySymbol,
      brokerSymbol,
      timeframe: tf,
      source: "metaapi_mt5",
    }));
  }

  const stream: AccountStream = {
    config,
    connection,
    subscribedSymbols,
    symbolMap: config.symbolMap,
  };

  activeStreams.set(config.metaApiAccountId, stream);
  return stream;
}

async function startAccountStreamIfNeeded(
  env: Env,
  config: AccountConfig,
): Promise<AccountStream | null> {
  const existing = activeStreams.get(config.metaApiAccountId);
  if (existing) return existing;
  if (startingStreams.has(config.metaApiAccountId)) return null;

  startingStreams.add(config.metaApiAccountId);
  try {
    return await startAccountStream(env, config);
  } finally {
    startingStreams.delete(config.metaApiAccountId);
  }
}

async function addSymbolsToStream(
  env: Env,
  stream: AccountStream,
  newSymbols: string[],
  symbolMap: Record<string, string>
): Promise<void> {
  if (!stream.connection) return;

  for (const displaySymbol of newSymbols) {
    const brokerSymbol = symbolMap[displaySymbol] ?? displaySymbol;
    if (stream.subscribedSymbols.has(brokerSymbol)) continue;

    try {
      await stream.connection.subscribeToMarketData(brokerSymbol);
      stream.subscribedSymbols.add(brokerSymbol);
      log("info", `  + subscribed ${displaySymbol} → ${brokerSymbol} (hot add)`);
    } catch (e) {
      log("warn", `  ✗ failed to hot-add ${displaySymbol} → ${brokerSymbol}:`, e);
    }
  }

  // Update the stream's config
  stream.config.watchlistSymbols = [
    ...new Set([...stream.config.watchlistSymbols, ...newSymbols]),
  ];
  stream.symbolMap = { ...stream.symbolMap, ...symbolMap };
}

/* ------------------------------------------------------------------ */
/*  Reconciliation loop                                                */
/* ------------------------------------------------------------------ */

async function reconcile(env: Env, currentConfigs: AccountConfig[]): Promise<AccountConfig[]> {
  try {
    const nextConfigs = await loadAccountConfigs();
    const diff = diffConfigs(currentConfigs, nextConfigs);

    if (diff.added.length > 0) {
      log("info", `Reconcile: ${diff.added.length} new account(s) found`);
    }

    const missingStreams = nextConfigs.filter(
      (config) => !activeStreams.has(config.metaApiAccountId),
    );
    if (missingStreams.length > 0) {
      log("info", `Reconcile: starting ${missingStreams.length} missing account stream(s)`);
      for (const config of missingStreams) {
        try {
          await startAccountStreamIfNeeded(env, config);
        } catch (e) {
          log("error", `Failed to start stream for account ${config.metaApiAccountId}:`, e);
        }
      }
    }

    if (diff.removed.length > 0) {
      log("info", `Reconcile: ${diff.removed.length} account(s) removed`);
      for (const config of diff.removed) {
        const stream = activeStreams.get(config.metaApiAccountId);
        if (stream?.connection) {
          try {
            await stream.connection.close();
          } catch { /* ignore */ }
        }
        activeStreams.delete(config.metaApiAccountId);
      }
    }

    const restartedAccounts = new Set<string>();
    if (diff.mappingsChanged.length > 0) {
      for (const config of diff.mappingsChanged) {
        const stream = activeStreams.get(config.metaApiAccountId);
        if (!stream) continue;

        log("info", `Reconcile: symbol map changed for ${config.metaApiAccountId}; restarting stream`);
        if (stream.connection) {
          try {
            await stream.connection.close();
          } catch { /* ignore */ }
        }
        activeStreams.delete(config.metaApiAccountId);
        restartedAccounts.add(config.metaApiAccountId);
        try {
          await startAccountStreamIfNeeded(env, config);
        } catch (e) {
          log("error", `Failed to restart stream for account ${config.metaApiAccountId}:`, e);
        }
      }
    }

    if (diff.symbolsChanged.length > 0) {
      for (const change of diff.symbolsChanged) {
        if (restartedAccounts.has(change.config.metaApiAccountId)) continue;

        const stream = activeStreams.get(change.config.metaApiAccountId);
        if (!stream) continue;

        if (change.addedSymbols.length > 0) {
          log("info", `Reconcile: +${change.addedSymbols.length} symbols for ${change.config.metaApiAccountId}`);
          await addSymbolsToStream(env, stream, change.addedSymbols, change.config.symbolMap);
        }
        if (change.removedSymbols.length > 0) {
          log("info", `Reconcile: -${change.removedSymbols.length} symbols for ${change.config.metaApiAccountId}`);
          // Don't unsubscribe — just stop tracking. MetaAPI handles cleanup.
          stream.config.watchlistSymbols = stream.config.watchlistSymbols.filter(
            (s) => !change.removedSymbols.includes(s)
          );
        }
      }
    }

    return nextConfigs;
  } catch (e) {
    log("error", "Reconciliation failed:", e);
    return currentConfigs;
  }
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

async function main() {
  const env = readEnv();
  startHealthServer();

  // ── Static mode (v1 compatibility) ─────────────────────────────
  if (env.STATIC_MODE && env.SUBSCRIPTIONS) {
    const subs = parseSubscriptions(env.SUBSCRIPTIONS);
    log("info", `STATIC_MODE: loaded ${subs.length} subscription(s) from SUBSCRIPTIONS env`);

    for (const sub of subs) {
      const config: AccountConfig = {
        userId: sub.userId,
        accountId: sub.accountId,
        metaApiAccountId: sub.metaApiAccountId,
        region: "london",
        symbolMap: { [sub.displaySymbol]: sub.brokerSymbol },
        watchlistSymbols: [sub.displaySymbol],
      };
      try {
        await startAccountStream(env, config);
      } catch (e) {
        log("error", `Failed to start static subscription ${sub.displaySymbol}:`, e);
      }
    }

    // No reconciliation in static mode — just stay alive
    log("info", "Static mode active — no reconciliation loop");
    return;
  }

  // ── Dynamic mode (v2 — Supabase) ───────────────────────────────
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    log("error", "Dynamic mode requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
    log("info", "Set STATIC_MODE=true to use legacy SUBSCRIPTIONS env var");
    process.exit(1);
  }

  log("info", "Dynamic mode — loading account configs from Supabase");
  let configs = await loadAccountConfigs();

  if (configs.length === 0) {
    log("warn", "No active MT5 cloud accounts found — will retry on reconciliation");
  } else {
    log("info", `Found ${configs.length} account(s)`);
    // Start all accounts in parallel — one slow broker shouldn't block others
    await Promise.allSettled(
      configs.map(async (config) => {
        try {
          await startAccountStreamIfNeeded(env, config);
        } catch (e) {
          log("error", `Failed to start stream for ${config.metaApiAccountId}:`, e);
        }
      })
    );
  }

  // ── Reconciliation loop ────────────────────────────────────────
  let reconcileInFlight = false;
  const reconcileTimer = setInterval(async () => {
    if (reconcileInFlight) {
      log("warn", "Skipping reconciliation; previous run is still in progress");
      return;
    }

    reconcileInFlight = true;
    log("debug", "Running reconciliation…");
    try {
      configs = await reconcile(env, configs);
    } finally {
      reconcileInFlight = false;
    }
  }, RECONCILE_INTERVAL_MS);

  // ── Heartbeat (keeps process alive + monitors health) ──────────
  const heartbeatTimer = setInterval(() => {
    const mem = process.memoryUsage();
    const rss = Math.round(mem.rss / 1024 / 1024);
    const heap = Math.round(mem.heapUsed / 1024 / 1024);
    const heapTotal = Math.round(mem.heapTotal / 1024 / 1024);
    const stats = Array.from(activeStreams.values()).map((s) => ({
      account: s.config.metaApiAccountId.slice(0, 8) + "…",
      symbols: s.subscribedSymbols.size,
      connected: s.connection !== null,
    }));
    log("info", `Heartbeat: ${activeStreams.size} stream(s) | RSS ${rss}MB | Heap ${heap}/${heapTotal}MB | Inflight ${getInflightCount()}`, stats);

    // Force GC if available (Node --expose-gc)
    if (rss > 400 && typeof globalThis.gc === "function") {
      globalThis.gc();
      log("warn", `GC forced at RSS ${rss}MB`);
    }
  }, 30_000);

  // ── Graceful shutdown ──────────────────────────────────────────
  const shutdown = async (signal: string) => {
    log("info", `${signal} received — shutting down`);
    clearInterval(reconcileTimer);
    clearInterval(heartbeatTimer);

    for (const [id, stream] of activeStreams) {
      if (stream.connection) {
        try {
          await stream.connection.close();
          log("info", `Closed connection for ${id}`);
        } catch { /* ignore */ }
      }
    }

    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  log("error", "fatal:", err);
  process.exit(1);
});
