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
