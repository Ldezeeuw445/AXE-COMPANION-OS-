import type { BrokerConnection, BrokerEnvironment, BrokerOAuthExchangeInput } from "../types";
import { getAlpacaOAuthConfig } from "../alpaca-config";

export interface BrokerTileViewModel {
  broker: "mt5" | "alpaca" | "ibkr";
  title: string;
  subtitle: string;
  state: "connected" | "needs_attention" | "disconnected";
  connectionId?: string;
  environment?: BrokerEnvironment;
  primaryAction:
    | { kind: "connect_mt5" }
    | { kind: "connect_alpaca"; environment: BrokerEnvironment }
    | { kind: "connect_ibkr"; environment: BrokerEnvironment }
    | { kind: "refresh_auth"; connectionId: string }
    | { kind: "open_broker"; connectionId: string }
    | { kind: "disconnect"; connectionId: string };
}

export interface BuildAlpacaAuthorizeUrlInput {
  environment: BrokerEnvironment;
  state: string;
  redirectUri?: string;
  scopes?: string[];
}

export interface CompleteAlpacaCallbackInput {
  apiBaseUrl: string;
  userId: string;
  environment: BrokerEnvironment;
  code: string;
  state?: string;
  expectedState?: string;
  redirectUri?: string;
  codeVerifier?: string;
  scopes?: string[];
}

export interface CompleteAlpacaCallbackResult {
  connection: BrokerConnection;
}

function joinUrl(base: string, path: string) {
  return new URL(path, base.endsWith("/") ? base : `${base}/`).toString();
}

export function randomState() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `alpaca_state_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function buildAlpacaAuthorizeUrl(input: BuildAlpacaAuthorizeUrlInput) {
  const oauth = getAlpacaOAuthConfig();
  if (!oauth.clientId) {
    throw new Error("Missing ALPACA_OAUTH_CLIENT_ID. The accounts tab cannot start Alpaca Connect without it.");
  }

  const redirectUri = input.redirectUri || oauth.redirectUri;
  if (!redirectUri) {
    throw new Error("Missing redirect URI for Alpaca Connect.");
  }

  const scopes = input.scopes?.length ? input.scopes : oauth.scopes;
  const url = new URL(oauth.authorizeUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", oauth.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", input.state);
  url.searchParams.set("scope", scopes.join(" "));
  url.searchParams.set("env", input.environment);
  return url.toString();
}

export function startAlpacaConnect(
  input: BuildAlpacaAuthorizeUrlInput,
  navigate: (url: string) => void = (url) => {
    if (typeof window !== "undefined") window.location.assign(url);
  }
) {
  const url = buildAlpacaAuthorizeUrl(input);
  navigate(url);
  return url;
}

export async function completeAlpacaCallback(
  input: CompleteAlpacaCallbackInput
): Promise<CompleteAlpacaCallbackResult> {
  if (input.expectedState && input.state !== input.expectedState) {
    throw new Error("OAuth state mismatch. Refusing to attach Alpaca connection.");
  }

  const body: BrokerOAuthExchangeInput = {
    userId: input.userId,
    broker: "alpaca",
    environment: input.environment,
    code: input.code,
    redirectUri: input.redirectUri,
    codeVerifier: input.codeVerifier,
    scopes: input.scopes,
  };

  const response = await fetch(joinUrl(input.apiBaseUrl, "broker/connections"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const parsed = (await response.json()) as { connection?: BrokerConnection; error?: string };
  if (!response.ok || !parsed.connection) {
    throw new Error(parsed.error || "Failed to complete Alpaca OAuth callback.");
  }

  return {
    connection: parsed.connection,
  };
}

export async function refreshAlpacaConnection(apiBaseUrl: string, connectionId: string) {
  const response = await fetch(joinUrl(apiBaseUrl, "broker/connections"), {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "refresh_auth",
      connectionId,
    }),
  });

  const parsed = (await response.json()) as { connection?: BrokerConnection; error?: string };
  if (!response.ok || !parsed.connection) {
    throw new Error(parsed.error || "Failed to refresh Alpaca broker connection.");
  }
  return parsed.connection;
}

export async function disconnectBrokerConnection(apiBaseUrl: string, connectionId: string) {
  const url = new URL(joinUrl(apiBaseUrl, "broker/connections"));
  url.searchParams.set("connectionId", connectionId);

  const response = await fetch(url.toString(), {
    method: "DELETE",
  });
  const parsed = (await response.json()) as { ok?: boolean; error?: string };
  if (!response.ok || !parsed.ok) {
    throw new Error(parsed.error || "Failed to disconnect broker connection.");
  }
}

export function buildAccountsTabBrokerTiles(
  connections: BrokerConnection[]
): BrokerTileViewModel[] {
  const latestMt5 = connections.find((connection) => connection.broker === "mt5");
  const latestAlpaca = connections.find((connection) => connection.broker === "alpaca");
  const latestIbkr = connections.find((connection) => connection.broker === "ibkr");

  return [
    latestMt5
      ? {
          broker: "mt5",
          title: "MT5",
          subtitle:
            latestMt5.status === "connected"
              ? `${latestMt5.environment.toUpperCase()} connected`
              : latestMt5.status,
          state: latestMt5.status === "connected" ? "connected" : "needs_attention",
          connectionId: latestMt5.id,
          environment: latestMt5.environment,
          primaryAction: { kind: "open_broker", connectionId: latestMt5.id },
        }
      : {
          broker: "mt5",
          title: "MT5",
          subtitle: "Connect your MetaTrader account",
          state: "disconnected",
          primaryAction: { kind: "connect_mt5" },
        },
    latestAlpaca
      ? {
          broker: "alpaca",
          title: "Alpaca",
          subtitle:
            latestAlpaca.status === "connected"
              ? `${latestAlpaca.environment.toUpperCase()} connected`
              : latestAlpaca.status === "reauth_required"
                ? "Session expired — reconnect required"
                : latestAlpaca.status,
          state: latestAlpaca.status === "connected" ? "connected" : "needs_attention",
          connectionId: latestAlpaca.id,
          environment: latestAlpaca.environment,
          primaryAction:
            latestAlpaca.status === "reauth_required"
              ? { kind: "refresh_auth", connectionId: latestAlpaca.id }
              : { kind: "open_broker", connectionId: latestAlpaca.id },
        }
      : {
          broker: "alpaca",
          title: "Alpaca",
          subtitle: "Connect paper or live via Alpaca Connect",
          state: "disconnected",
          primaryAction: { kind: "connect_alpaca", environment: "live" },
        },
    latestIbkr
      ? {
          broker: "ibkr",
          title: "IBKR",
          subtitle:
            latestIbkr.status === "connected"
              ? `${latestIbkr.environment.toUpperCase()} connected`
              : latestIbkr.status,
          state: latestIbkr.status === "connected" ? "connected" : "needs_attention",
          connectionId: latestIbkr.id,
          environment: latestIbkr.environment,
          primaryAction: { kind: "open_broker", connectionId: latestIbkr.id },
        }
      : {
          broker: "ibkr",
          title: "IBKR",
          subtitle: "Connect Gateway or Client Portal",
          state: "disconnected",
          primaryAction: { kind: "connect_ibkr", environment: "paper" },
        },
  ];
}
