/**
 * Same-origin chart WebSocket (`/ws/chart`) on the Next Node HTTP server.
 *
 * Cloudflare chart-edge remains the optional edge path. This gateway is why
 * the phone chart can show WS instead of SSE when NEXT_PUBLIC_CHART_WS_URL
 * was never set — the usual production miss.
 *
 * Attaches by intercepting `upgrade` on http.Server (next start / next dev).
 * nginx in front of Next must forward Upgrade; otherwise the client uses SSE.
 */
import { Server as HttpServer } from "node:http";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { CHART_WS_PATH } from "@/lib/chart/sameOriginWsUrl";
import { getChartSessionSecret } from "@/lib/chart/chartSessionSecret";
import { verifyChartSessionToken } from "@/lib/chart/sessionToken";
import { runChartLivePoller } from "@/lib/chart/livePoller";
import { getMetaApiToken } from "@/lib/mt5/metaApiEnv";
import type { ChartLiveEvent } from "@/lib/chart/liveContract";

type WsLike = {
  readyState: number;
  send: (data: string) => void;
  close: () => void;
  on: (event: "close" | "error", listener: () => void) => void;
};

const WS_OPEN = 1;

function emitTo(ws: WsLike, event: ChartLiveEvent) {
  if (ws.readyState !== WS_OPEN) return;
  try {
    ws.send(JSON.stringify(event));
  } catch {
    /* socket closing */
  }
}

type Room = {
  clients: Set<WsLike>;
  stop: () => void;
};

const rooms = new Map<string, Room>();
let attached = false;

/**
 * When a room last received a pushed event, by room key.
 *
 * The streamer and the REST poller feed the same rooms. While real ticks are
 * arriving the poller stands down — otherwise every chart would pay for
 * MetaApi REST calls it does not need, and the two sources would fight over
 * the same candle.
 */
const lastPushAt = new Map<string, number>();
const PUSH_FRESH_MS = 20_000;

export function hasRecentPush(key: string): boolean {
  const at = lastPushAt.get(key);
  return at != null && Date.now() - at < PUSH_FRESH_MS;
}

/**
 * Fan a streamer event into the live rooms on this server.
 *
 * Same contract as the Cloudflare worker's /internal/publish, including the
 * `userId|accountId|brokerSymbol|timeframe` key, so the existing streamer can
 * point here without changes. A `*` timeframe reaches every timeframe open on
 * that symbol, which is how position and order updates are addressed.
 *
 * Returns how many sockets the event reached.
 */
export function publishChartEvent(key: string, event: ChartLiveEvent): number {
  const wildcard = key.endsWith("|*");
  const prefix = wildcard ? key.slice(0, -1) : null;
  let reached = 0;

  for (const [roomId, room] of rooms) {
    const match = wildcard ? roomId.startsWith(prefix!) : roomId === key;
    if (!match) continue;
    lastPushAt.set(roomId, Date.now());
    for (const client of room.clients) {
      emitTo(client, event);
      reached += 1;
    }
  }
  if (!wildcard) lastPushAt.set(key, Date.now());
  return reached;
}

function pathnameOf(req: IncomingMessage): string {
  try {
    return new URL(req.url ?? "/", "http://localhost").pathname;
  } catch {
    return (req.url ?? "").split("?")[0] ?? "";
  }
}

function roomKey(userId: string, accountId: string, brokerSymbol: string, timeframe: string): string {
  return `${userId}|${accountId}|${brokerSymbol}|${timeframe}`;
}

function joinRoom(
  key: string,
  ws: WsLike,
  pollArgs: {
    userId: string;
    accountId: string;
    displaySymbol: string;
    brokerSymbol: string;
    timeframeKey: string;
    metaAccountId: string;
    accountRegion: string | null;
  },
) {
  let room = rooms.get(key);
  if (!room) {
    let stopped = false;
    const clients = new Set<WsLike>();
    room = {
      clients,
      stop: () => {
        stopped = true;
      },
    };
    rooms.set(key, room);
    void runChartLivePoller({
      ...pollArgs,
      emit: (event) => {
        for (const client of clients) emitTo(client, event);
      },
      isStopped: () => stopped || clients.size === 0,
      // Real ticks are arriving from the streamer: leave the REST API alone.
      pushActive: () => hasRecentPush(key),
    }).finally(() => {
      if (rooms.get(key) === room) rooms.delete(key);
    });
  }
  room.clients.add(ws);
  const leave = () => {
    room?.clients.delete(ws);
    if (room && room.clients.size === 0) {
      room.stop();
      rooms.delete(key);
    }
  };
  ws.on("close", leave);
  ws.on("error", leave);
}

export async function attachChartWebSocket(): Promise<void> {
  if (attached) return;
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.VERCEL === "1") return;

  attached = true;

  let WebSocketServer: typeof import("ws").WebSocketServer;
  try {
    ({ WebSocketServer } = await import("ws"));
  } catch (e) {
    attached = false;
    console.error("[chart-ws] ws package missing:", e);
    return;
  }

  const wss = new WebSocketServer({ noServer: true });
  const originalEmit = HttpServer.prototype.emit;

  HttpServer.prototype.emit = function patchedEmit(event: string, ...args: unknown[]) {
    if (event === "upgrade") {
      const req = args[0] as IncomingMessage;
      const socket = args[1] as Duplex;
      const head = args[2] as Buffer;
      if (pathnameOf(req) === CHART_WS_PATH) {
        wss.handleUpgrade(req, socket, head, (ws) => {
          wss.emit("connection", ws, req);
        });
        return true;
      }
    }
    return (originalEmit as (event: string, ...args: unknown[]) => boolean).call(
      this,
      event,
      ...args,
    );
  };

  wss.on("connection", (ws, req: IncomingMessage) => {
    void (async () => {
      const { secret } = getChartSessionSecret();
      if (!secret) {
        ws.close();
        return;
      }
      let url: URL;
      try {
        url = new URL(req.url ?? "/", "http://localhost");
      } catch {
        ws.close();
        return;
      }
      const payload = await verifyChartSessionToken(url.searchParams.get("token") ?? "", secret);
      if (!payload) {
        ws.close();
        return;
      }
      const account = url.searchParams.get("account") ?? "";
      const requestedSymbol = (url.searchParams.get("symbol") ?? "").toUpperCase();
      const tfKey = (url.searchParams.get("tf") ?? "h1").toLowerCase();
      if (
        account !== payload.accountId ||
        requestedSymbol !== payload.displaySymbol ||
        tfKey !== payload.timeframe
      ) {
        ws.close();
        return;
      }
      if (!getMetaApiToken()) {
        emitTo(ws as unknown as WsLike, { type: "error", reason: "provider_not_configured" });
        ws.close();
        return;
      }

      const key = roomKey(payload.userId, payload.accountId, payload.brokerSymbol, payload.timeframe);
      joinRoom(key, ws as unknown as WsLike, {
        userId: payload.userId,
        accountId: payload.accountId,
        displaySymbol: payload.displaySymbol,
        brokerSymbol: payload.brokerSymbol,
        timeframeKey: payload.timeframe,
        metaAccountId: payload.metaApiAccountId,
        accountRegion: payload.metaapiRegion ?? null,
      });
    })();
  });

  console.log("[chart-ws] same-origin /ws/chart attached");
}
