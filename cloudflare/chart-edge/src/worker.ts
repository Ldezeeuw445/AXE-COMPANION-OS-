/// <reference types="@cloudflare/workers-types" />

/**
 * AXE Companion — chart edge worker.
 *
 * Exposes:
 *   GET  /health
 *   GET  /ws/chart?account=…&symbol=…&tf=…&token=<HS256 JWT>
 *   POST /internal/publish      (HMAC-signed payloads from a Node MetaApi streamer)
 *
 * Why Durable Objects?
 *   - Stateful per-room: one ChartLiveRoom per (userId, accountId, brokerSymbol, timeframe).
 *   - Hold a websocket fan-out, throttle MetaApi REST polling, broadcast to all devices,
 *     reconnect with backoff.
 *
 * Honest caveat:
 *   The official MetaApi socket.io SDK is a Node-targeted package. It does not run cleanly
 *   in the Workers runtime. Two production paths are supported here:
 *
 *   A) (current default) The DO polls MetaApi REST endpoints itself: current-price (~2.5s),
 *      last candle (~12s), positions (~8s). Same shape as the SSE fallback in /api/chart/live.
 *
 *   B) (preferred for serious scale) A separate Node MetaApi streamer connects to MetaApi via
 *      socket.io and POSTs normalized events to /internal/publish (HMAC-signed). The DO becomes
 *      a pure fan-out room. The frontend contract does not change.
 */

import { verifyChartSessionToken } from "./sessionToken";
import type { ChartLiveEvent, ChartLiveStatus, LiveCandle, LivePositionPayload } from "./liveContract";

export interface Env {
  CHART_LIVE_ROOM: DurableObjectNamespace;
  CHART_SESSION_JWT_SECRET: string;
  METAAPI_TOKEN: string;
  METAAPI_CLIENT_API_URL?: string;
  METAAPI_MARKET_DATA_URL?: string;
  ALLOWED_ORIGINS?: string;
  STREAMER_SECRET?: string;
}

const DEFAULT_CLIENT = "https://mt-client-api-vzsrmwxzqcwfarnn.london.agiliumtrade.ai";
const DEFAULT_MARKET = "https://mt-market-data-client-api-v1.london.agiliumtrade.ai";

const TF_MAP: Record<string, string> = {
  m5: "5m",
  m15: "15m",
  m30: "30m",
  h1: "1h",
  h4: "4h",
  d1: "1d",
};

const TICK_INTERVAL_MS = 2_500;
const CANDLE_INTERVAL_MS = 12_000;
const POSITIONS_INTERVAL_MS = 8_000;
const DELAYED_THRESHOLD_FAILURES = 3;
const IDLE_HARD_CLOSE_MS = 5 * 60_000;

function corsHeaders(env: Env, origin: string | null): Record<string, string> {
  const allowed = (env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const allow = origin && allowed.includes(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allow || (allowed.length === 0 ? "*" : ""),
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(env, req.headers.get("Origin")) });
    }

    if (url.pathname === "/health") {
      return new Response("ok", { status: 200, headers: corsHeaders(env, req.headers.get("Origin")) });
    }

    if (url.pathname === "/ws/chart") {
      return handleWsRoute(req, env, url);
    }

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
  if (!payload) {
    return new Response("invalid_token", { status: 401 });
  }

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
  displaySymbol: string;
  brokerSymbol: string;
  timeframe: string;
  metaApiTimeframe: string;
};

export class ChartLiveRoom implements DurableObject {
  private readonly state: DurableObjectState;
  private readonly env: Env;
  private readonly clients = new Set<WebSocket>();
  private room: RoomState | null = null;
  private pollHandle: ReturnType<typeof setTimeout> | null = null;
  private lastTickAt = 0;
  private lastCandleAt = 0;
  private lastPositionsAt = 0;
  private consecutiveTickFailures = 0;
  private status: ChartLiveStatus = "reconnecting";
  private idleSince: number | null = null;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === "/publish" || (req.method === "POST" && url.pathname.endsWith("/publish"))) {
      return this.handleInternalPublish(req);
    }

    if (req.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("expected_websocket", { status: 426 });
    }

    const token = url.searchParams.get("token") ?? "";
    const payload = await verifyChartSessionToken(token, this.env.CHART_SESSION_JWT_SECRET);
    if (!payload) return new Response("invalid_token", { status: 401 });

    if (!this.room) {
      this.room = {
        userId: payload.userId,
        accountId: payload.accountId,
        metaApiAccountId: payload.metaApiAccountId,
        displaySymbol: payload.displaySymbol,
        brokerSymbol: payload.brokerSymbol,
        timeframe: payload.timeframe,
        metaApiTimeframe: TF_MAP[payload.timeframe] ?? "1h",
      };
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();

    this.clients.add(server);
    this.idleSince = null;

    server.addEventListener("message", (ev) => this.handleClientMessage(server, ev));
    server.addEventListener("close", () => this.handleClientClose(server));
    server.addEventListener("error", () => this.handleClientClose(server));

    this.send(server, {
      type: "ready",
      userId: this.room.userId,
      accountId: this.room.accountId,
      displaySymbol: this.room.displaySymbol,
      brokerSymbol: this.room.brokerSymbol,
      timeframe: this.room.metaApiTimeframe,
      source: "metaapi_mt5",
    });

    this.kickPollLoop();

    return new Response(null, { status: 101, webSocket: client });
  }

  private handleClientMessage(_ws: WebSocket, ev: MessageEvent) {
    if (typeof ev.data === "string" && ev.data === "ping") {
      try {
        _ws.send(JSON.stringify({ type: "heartbeat" } satisfies ChartLiveEvent));
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

  private kickPollLoop() {
    if (this.pollHandle) return;
    const tick = async () => {
      this.pollHandle = null;

      if (this.clients.size === 0) {
        if (this.idleSince && Date.now() - this.idleSince > IDLE_HARD_CLOSE_MS) {
          this.room = null;
          return;
        }
        this.pollHandle = setTimeout(tick, 5_000);
        return;
      }

      try {
        await this.pollOnce();
      } catch {
        /* keep stream alive — handled inside pollOnce */
      }
      this.pollHandle = setTimeout(tick, 750);
    };

    void tick();
  }

  private async pollOnce() {
    const r = this.room;
    if (!r) return;
    const now = Date.now();
    const clientBase = (this.env.METAAPI_CLIENT_API_URL ?? DEFAULT_CLIENT).replace(/\/$/, "");
    const marketBase = (this.env.METAAPI_MARKET_DATA_URL ?? DEFAULT_MARKET).replace(/\/$/, "");

    if (now - this.lastTickAt >= TICK_INTERVAL_MS) {
      this.lastTickAt = now;
      try {
        const url = `${clientBase}/users/current/accounts/${encodeURIComponent(r.metaApiAccountId)}/symbols/${encodeURIComponent(r.brokerSymbol)}/current-price`;
        const res = await fetch(url, {
          headers: { Accept: "application/json", "auth-token": this.env.METAAPI_TOKEN },
        });
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
        const res = await fetch(url, {
          headers: { Accept: "application/json", "auth-token": this.env.METAAPI_TOKEN },
        });
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
        const res = await fetch(url, {
          headers: { Accept: "application/json", "auth-token": this.env.METAAPI_TOKEN },
        });
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
  }

  private setStatus(next: ChartLiveStatus, reason?: string) {
    if (this.status === next) return;
    this.status = next;
    this.broadcast({ type: "live_status", status: next, reason });
  }

  private broadcast(event: ChartLiveEvent) {
    const msg = JSON.stringify(event);
    for (const ws of this.clients) {
      try {
        ws.send(msg);
      } catch {
        /* ignore broken socket; close handler removes it */
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
