import type {
  BrokerAccount,
  BrokerConnection,
  BrokerOrder,
  BrokerPosition,
  BrokerQuote,
  ConnectInput,
  BrokerOAuthExchangeInput,
  PlaceOrderInput,
  ReplaceOrderInput,
  BrokerEvent,
  BrokerHealthcheck,
} from "./types";
import type { BrokerAdapter } from "./broker-contract";
import {
  ALPACA_CAPABILITIES,
  ALPACA_ENDPOINTS,
  getAlpacaApiHeaders,
  getAlpacaEnvironmentConfig,
  getAlpacaOAuthConfig,
  getAlpacaOAuthHeaders,
} from "./alpaca-config";

type AlpacaResolvedAuth =
  | { mode: "api_keys"; headers: Record<string, string> }
  | { mode: "oauth"; headers: Record<string, string> };

type AlpacaAdapterOptions = {
  resolveConnection?: (connectionId: string) => Promise<BrokerConnection | null>;
  resolveCredentials?: (connectionId: string) => Promise<AlpacaCredentials | null>;
  saveCredentials?: (connectionId: string, credentials: AlpacaCredentials) => Promise<void>;
  saveConnection?: (connection: BrokerConnection) => Promise<void>;
  onEvent?: (event: BrokerEvent) => void | Promise<void>;
  fetchImpl?: typeof fetch;
  WebSocketImpl?: typeof WebSocket;
};

type AlpacaCredentials = {
  keyId?: string;
  secretKey?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  tokenType?: string;
  scopes?: string[];
};

function buildUrl(base: string, path: string, query?: Record<string, unknown>) {
  const url = new URL(path, base);
  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null) continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function randomId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `alpaca_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function toNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.length) return Number(value);
  return 0;
}

function assertResponseOk(response: Response, body: unknown) {
  if (!response.ok) {
    throw new Error(`Alpaca HTTP ${response.status}: ${typeof body === "string" ? body : JSON.stringify(body)}`);
  }
}

export class AlpacaAdapter implements BrokerAdapter {
  readonly broker = "alpaca" as const;
  readonly capabilities = ALPACA_CAPABILITIES;

  private readonly connections = new Map<string, BrokerConnection>();
  private readonly fetchImpl: typeof fetch;
  private readonly resolveConnectionExternal?: AlpacaAdapterOptions["resolveConnection"];
  private readonly resolveCredentialsExternal?: AlpacaAdapterOptions["resolveCredentials"];
  private readonly saveCredentialsExternal?: AlpacaAdapterOptions["saveCredentials"];
  private readonly saveConnectionExternal?: AlpacaAdapterOptions["saveConnection"];
  private readonly onEvent?: AlpacaAdapterOptions["onEvent"];
  private readonly WebSocketImpl?: AlpacaAdapterOptions["WebSocketImpl"];

  constructor(options: AlpacaAdapterOptions = {}) {
    this.fetchImpl = options.fetchImpl || fetch;
    this.resolveConnectionExternal = options.resolveConnection;
    this.resolveCredentialsExternal = options.resolveCredentials;
    this.saveCredentialsExternal = options.saveCredentials;
    this.saveConnectionExternal = options.saveConnection;
    this.onEvent = options.onEvent;
    this.WebSocketImpl = options.WebSocketImpl || (typeof WebSocket !== "undefined" ? WebSocket : undefined);
  }

  async connect(input: ConnectInput): Promise<BrokerConnection> {
    const env = getAlpacaEnvironmentConfig(input.environment);

    const connection: BrokerConnection = {
      id: randomId(),
      userId: input.userId,
      broker: "alpaca",
      environment: input.environment,
      authMode: input.authMode,
      status: "pending",
      accountRefs: [],
      metadata: {
        tradingUrl: env.tradingUrl,
        streamUrl: env.streamUrl,
        dataUrl: env.dataUrl,
        hasStoredCredentials: Boolean(input.credentials),
        ...input.metadata,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const account = await this.fetchAccountSnapshot(connection, input.credentials);
    connection.status = "connected";
    connection.accountRefs = [String(account.id)];
    connection.lastSyncAt = new Date().toISOString();
    this.connections.set(connection.id, connection);

    await this.emit({
      type: "broker.connection.connected",
      connectionId: connection.id,
      broker: "alpaca",
      environment: connection.environment,
      at: new Date().toISOString(),
      payload: { brokerAccountId: String(account.id) },
    });

    return connection;
  }

  async disconnect(connectionId: string): Promise<void> {
    this.connections.delete(connectionId);
  }

  async exchangeOAuthCode(
    input: BrokerOAuthExchangeInput
  ): Promise<{ connection: BrokerConnection; credentials: Record<string, unknown> }> {
    if (input.broker !== "alpaca") {
      throw new Error(`Unsupported broker for Alpaca OAuth exchange: ${input.broker}`);
    }

    const oauth = getAlpacaOAuthConfig();
    if (!oauth.enabled) {
      throw new Error("ALPACA_ENABLE_OAUTH_CONNECT is false. Enable it before using Alpaca OAuth Connect.");
    }
    if (!oauth.clientId || !oauth.clientSecret) {
      throw new Error("Missing Alpaca OAuth client credentials. Set ALPACA_OAUTH_CLIENT_ID and ALPACA_OAUTH_CLIENT_SECRET.");
    }

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      client_id: oauth.clientId,
      client_secret: oauth.clientSecret,
    });
    if (input.redirectUri || oauth.redirectUri) {
      body.set("redirect_uri", input.redirectUri || oauth.redirectUri || "");
    }
    if (input.codeVerifier) {
      body.set("code_verifier", input.codeVerifier);
    }

    const response = await this.fetchImpl(oauth.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    const text = await response.text();
    const parsed = text ? JSON.parse(text) : {};
    assertResponseOk(response, parsed);

    const issued = parsed as Record<string, unknown>;
    const credentials: AlpacaCredentials = {
      accessToken: typeof issued.access_token === "string" ? issued.access_token : undefined,
      refreshToken: typeof issued.refresh_token === "string" ? issued.refresh_token : undefined,
      tokenType: typeof issued.token_type === "string" ? issued.token_type : "Bearer",
      scopes: Array.isArray(issued.scope)
        ? issued.scope.map((value) => String(value))
        : typeof issued.scope === "string"
          ? issued.scope.split(/\s+/).map((value) => value.trim()).filter(Boolean)
          : input.scopes || oauth.scopes,
      expiresAt:
        typeof issued.expires_in === "number"
          ? new Date(Date.now() + issued.expires_in * 1000).toISOString()
          : undefined,
    };

    if (!credentials.accessToken) {
      throw new Error("Alpaca OAuth code exchange did not return an access token.");
    }

    const connection = await this.connect({
      userId: input.userId,
      broker: "alpaca",
      environment: input.environment,
      authMode: "oauth",
      credentials,
      metadata: {
        ...input.metadata,
        oauthGrantType: "authorization_code",
        oauthConnectedAt: new Date().toISOString(),
      },
    });

    return {
      connection,
      credentials,
    };
  }

  async refreshAuth(connectionId: string): Promise<void> {
    const connection = await this.requireConnection(connectionId);
    if (connection.authMode !== "oauth") return;
    try {
      const oauth = getAlpacaOAuthConfig();
      const creds = await this.getStoredCredentials(connection);

      if (!oauth.enabled) {
        throw new Error("ALPACA_ENABLE_OAUTH_CONNECT is false. Enable it before refreshing Alpaca OAuth sessions.");
      }
      if (!oauth.clientId || !oauth.clientSecret) {
        throw new Error("Missing Alpaca OAuth client credentials. Set ALPACA_OAUTH_CLIENT_ID and ALPACA_OAUTH_CLIENT_SECRET.");
      }
      if (!creds.refreshToken) {
        throw new Error("Missing Alpaca OAuth refresh token.");
      }

      const body = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: creds.refreshToken,
        client_id: oauth.clientId,
        client_secret: oauth.clientSecret,
      });
      if (oauth.redirectUri) {
        body.set("redirect_uri", oauth.redirectUri);
      }

      const response = await this.fetchImpl(oauth.tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      });

      const text = await response.text();
      const parsed = text ? JSON.parse(text) : {};
      assertResponseOk(response, parsed);

      const refreshed = parsed as Record<string, unknown>;
      const nextCredentials: AlpacaCredentials = {
        ...creds,
        accessToken: typeof refreshed.access_token === "string" ? refreshed.access_token : creds.accessToken,
        refreshToken: typeof refreshed.refresh_token === "string" ? refreshed.refresh_token : creds.refreshToken,
        tokenType: typeof refreshed.token_type === "string" ? refreshed.token_type : creds.tokenType,
        scopes: Array.isArray(refreshed.scope)
          ? refreshed.scope.map((value) => String(value))
          : typeof refreshed.scope === "string"
            ? refreshed.scope.split(/\s+/).map((value) => value.trim()).filter(Boolean)
            : creds.scopes,
        expiresAt:
          typeof refreshed.expires_in === "number"
            ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
            : creds.expiresAt,
      };

      await this.saveCredentials(nextCredentials, connection.id);

      const refreshedConnection: BrokerConnection = {
        ...connection,
        status: "connected",
        updatedAt: new Date().toISOString(),
        lastSyncAt: new Date().toISOString(),
        metadata: {
          ...connection.metadata,
          oauthRefreshedAt: new Date().toISOString(),
        },
      };
      this.connections.set(refreshedConnection.id, refreshedConnection);
      await this.saveConnection(refreshedConnection);

      await this.emit({
        type: "broker.connection.connected",
        connectionId: connection.id,
        broker: "alpaca",
        environment: connection.environment,
        at: new Date().toISOString(),
        payload: {
          oauthRefreshed: true,
          expiresAt: nextCredentials.expiresAt,
        },
      });
    } catch (error) {
      const failedConnection: BrokerConnection = {
        ...connection,
        status: "reauth_required",
        updatedAt: new Date().toISOString(),
        metadata: {
          ...connection.metadata,
          oauthRefreshFailedAt: new Date().toISOString(),
        },
      };
      this.connections.set(failedConnection.id, failedConnection);
      await this.saveConnection(failedConnection);
      await this.emit({
        type: "broker.connection.degraded",
        connectionId: connection.id,
        broker: "alpaca",
        environment: connection.environment,
        at: new Date().toISOString(),
        payload: {
          reason: error instanceof Error ? error.message : "Unknown Alpaca OAuth refresh error.",
          reauthRequired: true,
        },
      });
      throw error;
    }
  }

  async getAccounts(connectionId: string): Promise<BrokerAccount[]> {
    const connection = await this.requireConnection(connectionId);
    const raw = await this.fetchAccountSnapshot(connection);
    return [this.normalizeAccount(connection, raw)];
  }

  async getPositions(connectionId: string): Promise<BrokerPosition[]> {
    const connection = await this.requireConnection(connectionId);
    const { tradingUrl } = this.getConnectionConfig(connection);
    const raw = await this.requestJson<unknown[]>(connection, "GET", buildUrl(tradingUrl, ALPACA_ENDPOINTS.positions));
    return raw.map((position) => this.normalizePosition(connection, position));
  }

  async getOrders(connectionId: string, status = "all"): Promise<BrokerOrder[]> {
    const connection = await this.requireConnection(connectionId);
    const { tradingUrl } = this.getConnectionConfig(connection);
    const raw = await this.requestJson<unknown[]>(
      connection,
      "GET",
      buildUrl(tradingUrl, ALPACA_ENDPOINTS.orders, { status, direction: "desc", nested: true })
    );
    return raw.map((order) => this.normalizeOrder(connection, order));
  }

  async getQuote(symbol: string, connectionId: string): Promise<BrokerQuote> {
    const connection = await this.requireConnection(connectionId);
    const { dataUrl } = this.getConnectionConfig(connection);
    const url = buildUrl(dataUrl, ALPACA_ENDPOINTS.latestQuoteStocks.replace("{symbol}", encodeURIComponent(symbol)));
    const raw = await this.requestJson<{ quote?: Record<string, unknown> }>(connection, "GET", url, undefined, true);
    const quote = raw.quote || {};
    return {
      symbol,
      bid: toNumber(quote.bp),
      ask: toNumber(quote.ap),
      bidSize: toNumber(quote.bs),
      askSize: toNumber(quote.as),
      timestamp: String(quote.t || new Date().toISOString()),
      source: "alpaca",
    };
  }

  async getPortfolioHistory(connectionId: string, params?: Record<string, unknown>): Promise<unknown> {
    const connection = await this.requireConnection(connectionId);
    const { tradingUrl } = this.getConnectionConfig(connection);
    return this.requestJson(connection, "GET", buildUrl(tradingUrl, ALPACA_ENDPOINTS.portfolioHistory, params));
  }

  async subscribeQuotes(symbols: string[], connectionId: string): Promise<void> {
    const connection = await this.requireConnection(connectionId);
    const { dataUrl } = this.getConnectionConfig(connection);
    if (!this.WebSocketImpl) {
      throw new Error("WebSocket implementation missing. Inject one in the adapter constructor on the server runtime.");
    }

    const feedStream = dataUrl.replace(/^https/, "wss") + "/v2/iex";
    const auth = await this.resolveAuth(connection);
    const ws = new this.WebSocketImpl(feedStream);

    ws.addEventListener("open", async () => {
      ws.send(JSON.stringify({ action: "auth", ...(await this.authPayload(connection, auth)) }));
      ws.send(JSON.stringify({ action: "subscribe", quotes: symbols }));
    });

    ws.addEventListener("message", async (event: MessageEvent) => {
      try {
        const parsed = JSON.parse(String(event.data)) as Array<Record<string, unknown>>;
        for (const item of parsed) {
          if (item.T !== "q") continue;
          await this.emit({
            type: "broker.quote.updated",
            connectionId,
            broker: "alpaca",
            environment: connection.environment,
            at: new Date().toISOString(),
            payload: {
              symbol: String(item.S),
              bid: toNumber(item.bp),
              ask: toNumber(item.ap),
              bidSize: toNumber(item.bs),
              askSize: toNumber(item.as),
              timestamp: String(item.t || new Date().toISOString()),
              source: "alpaca",
            },
          });
        }
      } catch {
        return;
      }
    });
  }

  async subscribeOrderUpdates(connectionId: string): Promise<void> {
    const connection = await this.requireConnection(connectionId);
    const { streamUrl } = this.getConnectionConfig(connection);
    if (!this.WebSocketImpl) {
      throw new Error("WebSocket implementation missing. Inject one in the adapter constructor on the server runtime.");
    }

    const auth = await this.resolveAuth(connection);
    const ws = new this.WebSocketImpl(streamUrl);

    ws.addEventListener("open", async () => {
      ws.send(JSON.stringify({ action: "auth", ...(await this.authPayload(connection, auth)) }));
      ws.send(JSON.stringify({ action: "listen", data: { streams: ["trade_updates"] } }));
    });

    ws.addEventListener("message", async (event: MessageEvent) => {
      try {
        const parsed = JSON.parse(String(event.data)) as Record<string, unknown>;
        if (parsed.stream !== "trade_updates") return;
        const data = (parsed.data || {}) as Record<string, unknown>;
        const order = (data.order || {}) as Record<string, unknown>;
        const eventName = String(data.event || "");
        const type =
          eventName === "fill"
            ? "broker.order.filled"
            : eventName === "canceled"
              ? "broker.order.canceled"
              : "broker.order.accepted";

        await this.emit({
          type,
          connectionId,
          broker: "alpaca",
          environment: connection.environment,
          at: new Date().toISOString(),
          payload: this.normalizeOrder(connection, order),
        });
      } catch {
        return;
      }
    });
  }

  async placeOrder(input: PlaceOrderInput): Promise<BrokerOrder> {
    const connection = await this.requireConnection(input.connectionId);
    if (connection.environment === "live" && process.env.ALPACA_ENABLE_LIVE_TRADING !== "true") {
      throw new Error("ALPACA_ENABLE_LIVE_TRADING is false. Live trading stays blocked until you explicitly enable it.");
    }

    const { tradingUrl } = this.getConnectionConfig(connection);
    const raw = await this.requestJson<Record<string, unknown>>(connection, "POST", buildUrl(tradingUrl, ALPACA_ENDPOINTS.orders), {
      symbol: input.symbol,
      side: input.side,
      type: input.type,
      time_in_force: input.tif || "day",
      qty: String(input.qty),
      limit_price: input.limitPrice,
      stop_price: input.stopPrice,
      extended_hours: input.extendedHours,
      client_order_id: input.clientOrderId,
    });
    return this.normalizeOrder(connection, raw);
  }

  async cancelOrder(connectionId: string, brokerOrderId: string): Promise<void> {
    const connection = await this.requireConnection(connectionId);
    const { tradingUrl } = this.getConnectionConfig(connection);
    await this.requestJson(connection, "DELETE", buildUrl(tradingUrl, `${ALPACA_ENDPOINTS.orders}/${brokerOrderId}`));
  }

  async replaceOrder(input: ReplaceOrderInput): Promise<BrokerOrder> {
    const connection = await this.requireConnection(input.connectionId);
    const { tradingUrl } = this.getConnectionConfig(connection);
    const raw = await this.requestJson<Record<string, unknown>>(
      connection,
      "PATCH",
      buildUrl(tradingUrl, `${ALPACA_ENDPOINTS.orders}/${input.brokerOrderId}`),
      {
        qty: input.qty ? String(input.qty) : undefined,
        limit_price: input.limitPrice,
        stop_price: input.stopPrice,
      }
    );
    return this.normalizeOrder(connection, raw);
  }

  async healthcheck(connectionId: string): Promise<BrokerHealthcheck> {
    const connection = await this.requireConnection(connectionId);
    try {
      await this.fetchAccountSnapshot(connection);
      return {
        ok: true,
        trading: true,
        marketData: true,
        authFresh: true,
        message: `Alpaca ${connection.environment} connection healthy.`,
      };
    } catch (error) {
      return {
        ok: false,
        trading: false,
        marketData: false,
        authFresh: false,
        message: error instanceof Error ? error.message : "Unknown Alpaca healthcheck error.",
      };
    }
  }

  private async fetchAccountSnapshot(connection: BrokerConnection, credentialsOverride?: AlpacaCredentials) {
    const { tradingUrl } = this.getConnectionConfig(connection);
    return this.requestJson<Record<string, unknown>>(
      connection,
      "GET",
      buildUrl(tradingUrl, ALPACA_ENDPOINTS.account),
      undefined,
      false,
      credentialsOverride
    );
  }

  private async requestJson<T>(
    connection: BrokerConnection,
    method: string,
    url: string,
    body?: Record<string, unknown>,
    useDataUrl = false,
    credentialsOverride?: AlpacaCredentials
  ): Promise<T> {
    const auth = await this.resolveAuth(connection, credentialsOverride);
    const headers = auth.headers;

    const response = await this.fetchImpl(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    const parsed = text ? JSON.parse(text) : {};
    assertResponseOk(response, parsed);
    return parsed as T;
  }

  private async requireConnection(connectionId: string): Promise<BrokerConnection> {
    const local = this.connections.get(connectionId);
    if (local) return local;
    if (this.resolveConnectionExternal) {
      const resolved = await this.resolveConnectionExternal(connectionId);
      if (resolved) return resolved;
    }
    throw new Error(`Broker connection not found: ${connectionId}`);
  }

  private getConnectionConfig(connection: BrokerConnection) {
    return getAlpacaEnvironmentConfig(connection.environment);
  }

  private async resolveAuth(connection: BrokerConnection, credentialsOverride?: AlpacaCredentials): Promise<AlpacaResolvedAuth> {
    const creds = credentialsOverride || (await this.getStoredCredentials(connection));

    if (connection.authMode === "oauth") {
      if (!creds.accessToken) {
        throw new Error("Missing Alpaca OAuth access token.");
      }
      return {
        mode: "oauth",
        headers: getAlpacaOAuthHeaders(creds.accessToken),
      };
    }

    if (!creds.keyId || !creds.secretKey) {
      throw new Error("Missing Alpaca API key credentials.");
    }

    return {
      mode: "api_keys",
      headers: getAlpacaApiHeaders(creds.keyId, creds.secretKey),
    };
  }

  private async authPayload(connection: BrokerConnection, auth: AlpacaResolvedAuth) {
    if (auth.mode === "oauth") {
      const creds = await this.getStoredCredentials(connection);
      return { access_token: creds.accessToken };
    }
    const creds = await this.getStoredCredentials(connection);
    return { key: creds.keyId, secret: creds.secretKey };
  }

  private async getStoredCredentials(connection: BrokerConnection): Promise<AlpacaCredentials> {
    const creds = await this.resolveCredentialsExternal?.(connection.id);
    if (!creds) {
      throw new Error(`Missing stored credentials for broker connection: ${connection.id}`);
    }
    return creds;
  }

  private async saveCredentials(credentials: AlpacaCredentials, connectionId: string) {
    if (!this.saveCredentialsExternal) {
      throw new Error("Missing credential persistence callback for Alpaca adapter.");
    }
    await this.saveCredentialsExternal(connectionId, credentials);
  }

  private async saveConnection(connection: BrokerConnection) {
    if (!this.saveConnectionExternal) return;
    await this.saveConnectionExternal(connection);
  }

  private normalizeAccount(connection: BrokerConnection, raw: Record<string, unknown>): BrokerAccount {
    return {
      connectionId: connection.id,
      brokerAccountId: String(raw.id || ""),
      displayName: `Alpaca ${connection.environment}`,
      currency: String(raw.currency || "USD"),
      equity: toNumber(raw.equity),
      cash: toNumber(raw.cash),
      buyingPower: toNumber(raw.buying_power),
      marginUsed: toNumber(raw.initial_margin),
      accountStatus: String(raw.status || "unknown"),
      raw,
    };
  }

  private normalizePosition(connection: BrokerConnection, raw: unknown): BrokerPosition {
    const position = raw as Record<string, unknown>;
    const qty = Math.abs(toNumber(position.qty));
    const side = toNumber(position.qty) < 0 ? "short" : "long";

    return {
      connectionId: connection.id,
      brokerAccountId: String(position.asset_id || connection.accountRefs[0] || ""),
      symbol: String(position.symbol || ""),
      assetClass: "stock",
      side,
      qty,
      avgEntryPrice: toNumber(position.avg_entry_price),
      marketPrice: toNumber(position.current_price),
      unrealizedPnl: toNumber(position.unrealized_pl),
      realizedPnl: toNumber(position.realized_pl),
      raw,
    };
  }

  private normalizeOrder(connection: BrokerConnection, raw: unknown): BrokerOrder {
    const order = raw as Record<string, unknown>;
    return {
      id: String(order.id || ""),
      connectionId: connection.id,
      brokerAccountId: String(order.account_id || connection.accountRefs[0] || ""),
      clientOrderId: String(order.client_order_id || order.id || ""),
      symbol: String(order.symbol || ""),
      side: String(order.side || "buy") as BrokerOrder["side"],
      type: String(order.order_type || order.type || "market") as BrokerOrder["type"],
      tif: String(order.time_in_force || "day") as BrokerOrder["tif"],
      qty: toNumber(order.qty),
      limitPrice: order.limit_price ? toNumber(order.limit_price) : undefined,
      stopPrice: order.stop_price ? toNumber(order.stop_price) : undefined,
      status: String(order.status || "unknown"),
      createdAt: String(order.created_at || new Date().toISOString()),
      updatedAt: String(order.updated_at || order.created_at || new Date().toISOString()),
      raw,
    };
  }

  private async emit(event: BrokerEvent) {
    if (!this.onEvent) return;
    await this.onEvent(event);
  }
}
