import type { BrokerConnection, BrokerEvent } from "./types";
import { getAlpacaEnvironmentConfig } from "./alpaca-config";

type StreamOptions = {
  WebSocketImpl?: typeof WebSocket;
  onEvent?: (event: BrokerEvent) => void | Promise<void>;
};

type Credentials = {
  keyId?: string;
  secretKey?: string;
  accessToken?: string;
};

function getCredentials(connection: BrokerConnection) {
  return ((connection.metadata || {}).credentials || {}) as Credentials;
}

export function openAlpacaTradeUpdatesStream(connection: BrokerConnection, options: StreamOptions = {}) {
  const WebSocketImpl = options.WebSocketImpl || (typeof WebSocket !== "undefined" ? WebSocket : undefined);
  if (!WebSocketImpl) {
    throw new Error("Missing WebSocket implementation.");
  }

  const creds = getCredentials(connection);
  const env = getAlpacaEnvironmentConfig(connection.environment);
  const ws = new WebSocketImpl(env.streamUrl);

  ws.addEventListener("open", () => {
    if (connection.authMode === "oauth" && creds.accessToken) {
      ws.send(JSON.stringify({ action: "auth", access_token: creds.accessToken }));
    } else {
      ws.send(JSON.stringify({ action: "auth", key: creds.keyId, secret: creds.secretKey }));
    }
    ws.send(JSON.stringify({ action: "listen", data: { streams: ["trade_updates"] } }));
  });

  ws.addEventListener("message", async (event: MessageEvent) => {
    if (!options.onEvent) return;
    try {
      const parsed = JSON.parse(String(event.data)) as Record<string, unknown>;
      if (parsed.stream !== "trade_updates") return;
      await options.onEvent({
        type: "broker.order.accepted",
        connectionId: connection.id,
        broker: "alpaca",
        environment: connection.environment,
        at: new Date().toISOString(),
        payload: parsed,
      });
    } catch {
      return;
    }
  });

  return ws;
}

export function openAlpacaQuoteStream(
  connection: BrokerConnection,
  symbols: string[],
  options: StreamOptions = {}
) {
  const WebSocketImpl = options.WebSocketImpl || (typeof WebSocket !== "undefined" ? WebSocket : undefined);
  if (!WebSocketImpl) {
    throw new Error("Missing WebSocket implementation.");
  }

  const creds = getCredentials(connection);
  const env = getAlpacaEnvironmentConfig(connection.environment);
  const ws = new WebSocketImpl(env.dataUrl.replace(/^https/, "wss") + "/v2/iex");

  ws.addEventListener("open", () => {
    if (connection.authMode === "oauth" && creds.accessToken) {
      ws.send(JSON.stringify({ action: "auth", access_token: creds.accessToken }));
    } else {
      ws.send(JSON.stringify({ action: "auth", key: creds.keyId, secret: creds.secretKey }));
    }
    ws.send(JSON.stringify({ action: "subscribe", quotes: symbols }));
  });

  ws.addEventListener("message", async (event: MessageEvent) => {
    if (!options.onEvent) return;
    try {
      const parsed = JSON.parse(String(event.data)) as Array<Record<string, unknown>>;
      for (const item of parsed) {
        if (item.T !== "q") continue;
        await options.onEvent({
          type: "broker.quote.updated",
          connectionId: connection.id,
          broker: "alpaca",
          environment: connection.environment,
          at: new Date().toISOString(),
          payload: item,
        });
      }
    } catch {
      return;
    }
  });

  return ws;
}
