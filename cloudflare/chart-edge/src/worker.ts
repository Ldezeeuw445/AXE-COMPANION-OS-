/// <reference types="@cloudflare/workers-types" />

/**
 * AXE Companion — chart edge worker.
 *
 * Routes:
 *   GET  /health
 *   GET  /ws/chart?account=…&symbol=…&tf=…&token=<HS256 JWT>
 *   POST /internal/publish      (HMAC X-Streamer-Secret)
 *
 * Two modes (env `WORKER_MODE`):
 *   - "poll" (default) — Durable Object polls MetaApi REST itself; standard
 *     WebSocket fan-out using in-memory client set and a setTimeout loop.
 *   - "push"           — Durable Object uses the WebSocket Hibernation API.
 *     No timers run inside the DO; events arrive only via /internal/publish
 *     from a Node MetaApi streamer (see `node/metaapi-streamer/`).
 *
 * Frontend contract is identical in both modes.
 */

import { verifyChartSessionToken } from "./sessionToken";
import type { ChartLiveEvent, ChartLiveStatus, LiveCandle, LivePositionPayload, LivePendingOrderPayload } from "./liveContract";

export interface Env {
  CHART_LIVE_ROOM: DurableObjectNamespace;
  CHART_SESSION_JWT_SECRET: string;
  METAAPI_TOKEN: string;
  METAAPI_CLIENT_API_URL?: string;
  METAAPI_MARKET_DATA_URL?: string;
  ALLOWED_ORIGINS?: string;
  STREAMER_SECRET?: string;
  WORKER_MODE?: string;
}

const DEFAULT_CLIENT = "https://mt-client-api-vzsrmwxzqcwfarnn.london.agiliumtrade.ai";
const DEFAULT_MARKET = "https://mt-market-data-client-api-v1.london.agiliumtrade.ai";

const REGION_CLIENT: Record<string, string> = {
  london: DEFAULT_CLIENT,
  "new-york": "https://mt-client-api-vzsrmwxzqcwfarnn.new-york.agiliumtrade.ai",
  singapore: "https://mt-client-api-vzsrmwxzqcwfarnn.singapore.agiliumtrade.ai",
};

const REGION_MARKET: Record<string, string> = {
  london: DEFAULT_MARKET,
  "new-york": "https://mt-market-data-client-api-v1.new-york.agiliumtrade.ai",
  singapore: "https://mt-market-data-client-api-v1.singapore.agiliumtrade.ai",
};

function hostsForRegion(region: string | undefined, env: Env): { clientBase: string; marketBase: string } {
  const key = (region ?? "").trim().toLowerCase();
  const clientBase = (
    (key && REGION_CLIENT[key]) ||
    env.METAAPI_CLIENT_API_URL ||
    DEFAULT_CLIENT
  ).replace(/\/$/, "");
  const marketBase = (
    (key && REGION_MARKET[key]) ||
    env.METAAPI_MARKET_DATA_URL ||
    DEFAULT_MARKET
  ).replace(/\/$/, "");
  return { clientBase, marketBase };
}

const TF_MAP: Record<string, string> = {
  m5: "5m",
  m15: "15m",
  m30: "30m",
  h1: "1h",
  h4: "4h",
  d1: "1d",
};

const TICK_INTERVAL_MS = 1_000;
const CANDLE_INTERVAL_MS = 5_000;
const POSITIONS_INTERVAL_MS = 8_000;
const DELAYED_THRESHOLD_FAILURES = 3;
const IDLE_HARD_CLOSE_MS = 5 * 60_000;
const METAAPI_TICK_TIMEOUT_MS = 4_000;
const METAAPI_CANDLE_TIMEOUT_MS = 6_000;
const METAAPI_POSITIONS_TIMEOUT_MS = 5_000;

function isPushMode(env: Env): boolean {
  return (env.WORKER_MODE ?? "poll").toLowerCase() === "push";
}

function corsHeaders(env: Env, origin: string | null): Record<string, string> {
  const allowed = (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const allow = origin && allowed.includes(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allow || (allowed.length === 0 ? "*" : ""),
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Streamer-Secret",
  };
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(env, req.headers.get("Origin")) });
    }

    if (url.pathname === "/health") {
      return new Response(`ok mode=${isPushMode(env) ? "push" : "poll"}`, {
        status: 200,
        headers: corsHeaders(env, req.headers.get("Origin")),
      });
    }

    if (url.pathname === "/ws/chart") return handleWsRoute(req, env, url);
    if (url.pathname === "/internal/publish" && req.method === "POST") {
      return handlePublishRoute(req, env);
    }

    return new Response("not_found", { status: 404 });
  },
};

async function handleWsRoute(req: Request, env: Env, url: URL): Promise<Response> {
  if (req.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
    return new Response("expected_websocket", { status: 426 });
  }

  const token = url.searchParams.get("token") ?? "";
  if (!env.CHART_SESSION_JWT_SECRET) {
    return new Response("session_not_configured", { status: 503 });
  }
  const payload = await verifyChartSessionToken(token, env.CHART_SESSION_JWT_SECRET);
  if (!payload) return new Response("invalid_token", { status: 401 });

  const account = url.searchParams.get("account") ?? "";
  const requestedSymbol = (url.searchParams.get("symbol") ?? "").toUpperCase();
  const tfKey = (url.searchParams.get("tf") ?? "h1").toLowerCase();

  if (
    account !== payload.accountId ||
    requestedSymbol !== payload.displaySymbol ||
    tfKey !== payload.timeframe
  ) {
    return new Response("token_mismatch", { status: 401 });
  }

  const id = env.CHART_LIVE_ROOM.idFromName(
    `${payload.userId}|${payload.accountId}|${payload.brokerSymbol}|${payload.timeframe}`,
  );
  return env.CHART_LIVE_ROOM.get(id).fetch(req);
}

async function handlePublishRoute(req: Request, env: Env): Promise<Response> {
  const expected = env.STREAMER_SECRET;
  if (!expected) return new Response("publish_disabled", { status: 503 });

  const provided = req.headers.get("X-Streamer-Secret") ?? "";
  if (provided.length !== expected.length) return new Response("forbidden", { status: 403 });
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  if (diff !== 0) return new Response("forbidden", { status: 403 });

  let body: { roomKey: string; event: ChartLiveEvent };
  try {
    body = (await req.json()) as { roomKey: string; event: ChartLiveEvent };
  } catch {
    return new Response("invalid_json", { status: 400 });
  }
  if (!body?.roomKey || !body?.event) return new Response("missing_fields", { status: 400 });

  const id = env.CHART_LIVE_ROOM.idFromName(body.roomKey);
  return env.CHART_LIVE_ROOM.get(id).fetch(
    new Request("https://internal/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body.event),
    }),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Durable Object
// ─────────────────────────────────────────────────────────────────────────────

type RoomState = {
  userId: string;
  accountId: string;
  metaApiAccountId: string;
  metaapiRegion?: string;
  displaySymbol: string;
  brokerSymbol: string;
  timeframe: string;
  metaApiTimeframe: string;
};

const ROOM_STORAGE_KEY = "room_state_v1";

function roomMatchesPayload(current: RoomState | null, next: RoomState): boolean {
  return Boolean(
    current &&
      current.userId === next.userId &&
      current.accountId === next.accountId &&
      current.metaApiAccountId === next.metaApiAccountId &&
      (current.metaapiRegion ?? "") === (next.metaapiRegion ?? "") &&
      current.displaySymbol === next.displaySymbol &&
      current.brokerSymbol === next.brokerSymbol &&
      current.timeframe === next.timeframe &&
      current.metaApiTimeframe === next.metaApiTimeframe,
  );
}

export class ChartLiveRoom implements DurableObject {
  private readonly state: DurableObjectState;
  private readonly env: Env;
  /** poll mode only */
  private readonly clients = new Set<WebSocket>();
  private room: RoomState | null = null;
  private pollHandle: ReturnType<typeof setTimeout> | null = null;
  private lastTickAt = 0;
  private lastCandleAt = 0;
  private lastPositionsAt = 0;
  private lastOrdersAt = 0;
  private consecutiveTickFailures = 0;
  private status: ChartLiveStatus = "reconnecting";
  private idleSince: number | null = null;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname.endsWith("/publish") && req.method === "POST") {
      return this.handleInternalPublish(req);
    }

    if (req.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("expected_websocket", { status: 426 });
    }

    const token = url.searchParams.get("token") ?? "";
    const payload = await verifyChartSessionToken(token, this.env.CHART_SESSION_JWT_SECRET);
    if (!payload) return new Response("invalid_token", { status: 401 });

    const nextRoom: RoomState = {
      userId: payload.userId,
      accountId: payload.accountId,
      metaApiAccountId: payload.metaApiAccountId,
      metaapiRegion: payload.metaapiRegion,
      displaySymbol: payload.displaySymbol,
      brokerSymbol: payload.brokerSymbol,
      timeframe: payload.timeframe,
      metaApiTimeframe: TF_MAP[payload.timeframe] ?? "1h",
    };
    if (!this.room) {
      const stored = (await this.state.storage.get<RoomState>(ROOM_STORAGE_KEY)) ?? null;
      this.room = roomMatchesPayload(stored, nextRoom) ? stored : nextRoom;
      await this.state.storage.put(ROOM_STORAGE_KEY, this.room);
    } else if (!roomMatchesPayload(this.room, nextRoom)) {
      this.room = nextRoom;
      this.lastTickAt = 0;
      this.lastCandleAt = 0;
      this.lastPositionsAt = 0;
      this.lastOrdersAt = 0;
      this.consecutiveTickFailures = 0;
      this.status = "reconnecting";
      await this.state.storage.put(ROOM_STORAGE_KEY, this.room);
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    if (isPushMode(this.env)) {
      // Hibernation API — DO can sleep between events; broadcast iterates
      // state.getWebSockets() on demand.
      this.state.acceptWebSocket(server);
    } else {
      server.accept();
      this.clients.add(server);
      this.idleSince = null;
      server.addEventListener("message", (ev: MessageEvent) => this.handleClientMessage(server, ev));
      server.addEventListener("close", () => this.handleClientClose(server));
      server.addEventListener("error", () => this.handleClientClose(server));
      this.kickPollLoop();
    }

    this.send(server, {
      type: "ready",
      userId: this.room.userId,
      accountId: this.room.accountId,
      displaySymbol: this.room.displaySymbol,
      brokerSymbol: this.room.brokerSymbol,
      timeframe: this.room.metaApiTimeframe,
      source: "metaapi_mt5",
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  // ── poll-mode listeners ───────────────────────────────────────────────────

  private handleClientMessage(ws: WebSocket, ev: MessageEvent) {
    if (typeof ev.data === "string" && ev.data === "ping") {
      try {
        ws.send(JSON.stringify({ type: "heartbeat" } satisfies ChartLiveEvent));
      } catch {
        /* ignore */
      }
    }
  }

  private handleClientClose(ws: WebSocket) {
    this.clients.delete(ws);
    if (this.clients.size === 0) {
      this.idleSince = Date.now();
    }
  }

  // ── hibernation handlers (push mode) ──────────────────────────────────────

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    if (typeof message === "string" && message === "ping") {
      try {
        ws.send(JSON.stringify({ type: "heartbeat" } satisfies ChartLiveEvent));
      } catch {
        /* ignore */
      }
    }
  }

  webSocketClose(_ws: WebSocket): void {
    /* hibernation auto-cleans when no sockets remain */
  }

  webSocketError(_ws: WebSocket): void {
    /* same as close */
  }

  // ── publish & broadcast ───────────────────────────────────────────────────

  private async handleInternalPublish(req: Request): Promise<Response> {
    let evt: ChartLiveEvent;
    try {
      evt = (await req.json()) as ChartLiveEvent;
    } catch {
      return new Response("invalid_json", { status: 400 });
    }
    this.broadcast(evt);
    return new Response("ok", { status: 200 });
  }

  private allSockets(): WebSocket[] {
    if (isPushMode(this.env)) {
      return this.state.getWebSockets();
    }
    return Array.from(this.clients);
  }

  private kickPollLoop() {
    if (isPushMode(this.env)) return; // never poll in push mode
    if (this.pollHandle) return;
    const tick = async () => {
      this.pollHandle = null;

      if (this.clients.size === 0) {
        if (this.idleSince && Date.now() - this.idleSince > IDLE_HARD_CLOSE_MS) {
          this.room = null;
          await this.state.storage.delete(ROOM_STORAGE_KEY);
          return;
        }
        this.pollHandle = setTimeout(tick, 5_000);
        return;
      }

      try {
        await this.pollOnce();
      } catch {
        /* tolerated; pollOnce updates status internally */
      }
      this.pollHandle = setTimeout(tick, 750);
    };

    void tick();
  }

  private async pollOnce() {
    const r = this.room;
    if (!r) return;
    const now = Date.now();
    const { clientBase, marketBase } = hostsForRegion(r.metaapiRegion, this.env);

    if (now - this.lastTickAt >= TICK_INTERVAL_MS) {
      this.lastTickAt = now;
      try {
        const url = `${clientBase}/users/current/accounts/${encodeURIComponent(r.metaApiAccountId)}/symbols/${encodeURIComponent(r.brokerSymbol)}/current-price`;
        const res = await fetchWithTimeout(
          url,
          { headers: { Accept: "application/json", "auth-token": this.env.METAAPI_TOKEN } },
          METAAPI_TICK_TIMEOUT_MS,
        );
        if (res.ok) {
          const j = (await res.json()) as { bid?: number; ask?: number; brokerTime?: string; time?: string };
          const mid = j.bid != null && j.ask != null ? (j.bid + j.ask) / 2 : (j.bid ?? j.ask ?? null);
          this.broadcast({
            type: "tick",
            userId: r.userId,
            accountId: r.accountId,
            displaySymbol: r.displaySymbol,
            brokerSymbol: r.brokerSymbol,
            bid: j.bid ?? null,
            ask: j.ask ?? null,
            price: mid != null ? Number(mid) : null,
            timestamp: j.brokerTime ?? j.time ?? null,
            source: "metaapi_mt5",
          });
          this.consecutiveTickFailures = 0;
          this.setStatus("live");
        } else {
          this.consecutiveTickFailures += 1;
          if (res.status === 404) {
            this.setStatus("error", "broker_symbol_not_found");
          } else if (this.consecutiveTickFailures >= DELAYED_THRESHOLD_FAILURES) {
            this.setStatus("delayed", "tick_unavailable");
          }
        }
      } catch {
        this.consecutiveTickFailures += 1;
        if (this.consecutiveTickFailures >= DELAYED_THRESHOLD_FAILURES) {
          this.setStatus("delayed", "tick_unavailable");
        }
      }
    }

    if (now - this.lastCandleAt >= CANDLE_INTERVAL_MS) {
      this.lastCandleAt = now;
      try {
        const url = `${marketBase}/users/current/accounts/${encodeURIComponent(r.metaApiAccountId)}/historical-market-data/symbols/${encodeURIComponent(r.brokerSymbol)}/timeframes/${encodeURIComponent(r.metaApiTimeframe)}/candles?limit=2`;
        const res = await fetchWithTimeout(
          url,
          { headers: { Accept: "application/json", "auth-token": this.env.METAAPI_TOKEN } },
          METAAPI_CANDLE_TIMEOUT_MS,
        );
        if (res.ok) {
          const arr = (await res.json()) as LiveCandle[];
          const candle = Array.isArray(arr) && arr.length ? arr[arr.length - 1] : null;
          if (candle) {
            this.broadcast({
              type: "candle_update",
              userId: r.userId,
              accountId: r.accountId,
              displaySymbol: r.displaySymbol,
              brokerSymbol: r.brokerSymbol,
              timeframe: r.metaApiTimeframe,
              candle,
              patch: true,
              source: "metaapi_mt5",
            });
          }
        }
      } catch {
        /* tolerate */
      }
    }

    if (now - this.lastPositionsAt >= POSITIONS_INTERVAL_MS) {
      this.lastPositionsAt = now;
      try {
        const url = `${clientBase}/users/current/accounts/${encodeURIComponent(r.metaApiAccountId)}/positions`;
        const res = await fetchWithTimeout(
          url,
          { headers: { Accept: "application/json", "auth-token": this.env.METAAPI_TOKEN } },
          METAAPI_POSITIONS_TIMEOUT_MS,
        );
        if (res.ok) {
          const arr = (await res.json()) as Array<Record<string, unknown>>;
          const onSymbol: LivePositionPayload[] = arr
            .filter((q) => String(q.symbol ?? "") === r.brokerSymbol)
            .map((q, i) => ({
              id: String(q.id ?? q.positionId ?? i),
              symbol: String(q.symbol ?? ""),
              side: String(q.type ?? "").toUpperCase().includes("BUY") ? "buy" : "sell",
              volume: Number(q.volume ?? 0) || 0,
              entryPrice: q.openPrice != null ? Number(q.openPrice) : null,
              currentPrice:
                q.currentPrice != null ? Number(q.currentPrice) : q.price != null ? Number(q.price) : null,
              profit:
                q.profit != null
                  ? Number(q.profit)
                  : q.unrealizedProfit != null
                    ? Number(q.unrealizedProfit)
                    : null,
              stopLoss: q.stopLoss != null ? Number(q.stopLoss) : null,
              takeProfit: q.takeProfit != null ? Number(q.takeProfit) : null,
              openTime: (q.time as string) ?? (q.updateTime as string) ?? null,
            }));
          this.broadcast({
            type: "positions_update",
            userId: r.userId,
            accountId: r.accountId,
            total: arr.length,
            onSymbol,
            source: "metaapi_mt5",
          });
        }
      } catch {
        /* tolerate */
      }
    }

    // ── Pending orders poll (same interval, offset by 2s from positions) ──
    if (now - this.lastOrdersAt >= POSITIONS_INTERVAL_MS) {
      this.lastOrdersAt = now;
      try {
        const url = `${clientBase}/users/current/accounts/${encodeURIComponent(r.metaApiAccountId)}/orders`;
        const res = await fetchWithTimeout(
          url,
          { headers: { Accept: "application/json", "auth-token": this.env.METAAPI_TOKEN } },
          METAAPI_POSITIONS_TIMEOUT_MS,
        );
        if (res.ok) {
          const arr = (await res.json()) as Array<Record<string, unknown>>;
          const onSymbol: LivePendingOrderPayload[] = arr
            .filter((q) => String(q.symbol ?? "") === r.brokerSymbol)
            .map((q, i) => {
              const rawType = (String(q.type ?? "")).toLowerCase().replace(/_/g, " ");
              let type = rawType.trim() || "pending";
              if (rawType.includes("buy") && rawType.includes("limit")) type = "buy_limit";
              else if (rawType.includes("sell") && rawType.includes("limit")) type = "sell_limit";
              else if (rawType.includes("buy") && rawType.includes("stop")) type = "buy_stop";
              else if (rawType.includes("sell") && rawType.includes("stop")) type = "sell_stop";
              const side = type.startsWith("buy") ? "buy" : type.startsWith("sell") ? "sell" : "unknown";
              return {
                id: String(q.id ?? q.orderId ?? i),
                symbol: String(q.symbol ?? ""),
                type,
                side,
                volume: Number(q.volume ?? 0) || 0,
                openPrice: Number(q.openPrice ?? q.price ?? 0),
                currentPrice: q.currentPrice != null ? Number(q.currentPrice) : null,
                stopLoss: q.stopLoss != null ? Number(q.stopLoss) : null,
                takeProfit: q.takeProfit != null ? Number(q.takeProfit) : null,
                openTime: (q.time as string) ?? null,
              };
            });
          this.broadcast({
            type: "orders_update",
            userId: r.userId,
            accountId: r.accountId,
            total: arr.length,
            onSymbol,
            source: "metaapi_mt5",
          });
        } else {
          this.clearOrdersOverlay(r);
        }
      } catch {
        this.clearOrdersOverlay(r);
      }
    }
  }

  private clearOrdersOverlay(r: RoomState) {
    this.broadcast({
      type: "orders_update",
      userId: r.userId,
      accountId: r.accountId,
      total: 0,
      onSymbol: [],
      source: "metaapi_mt5",
    });
  }

  private setStatus(next: ChartLiveStatus, reason?: string) {
    if (this.status === next) return;
    this.status = next;
    this.broadcast({ type: "live_status", status: next, reason });
  }

  private broadcast(event: ChartLiveEvent) {
    const msg = JSON.stringify(event);
    for (const ws of this.allSockets()) {
      try {
        ws.send(msg);
      } catch {
        /* dropped socket cleaned up by the platform */
      }
    }
  }

  private send(ws: WebSocket, event: ChartLiveEvent) {
    try {
      ws.send(JSON.stringify(event));
    } catch {
      /* ignore */
    }
  }
}
