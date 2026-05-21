/**
 * Server-only MetaApi HTTP client. Do not import from client components.
 */

import { randomBytes } from "node:crypto";
import {
  getMetaApiClientBaseUrl,
  getMetaApiDefaultRegion,
  getMetaApiMarketDataBaseUrl,
  getMetaApiProvisioningBaseUrl,
  getMetaApiToken,
} from "@/lib/mt5/metaApiEnv";
import { classifyHttpStatus, classifyMetaApiProvisioningError, type Mt5CloudErrorCode } from "@/lib/mt5/metaApiErrors";

export type MetaApiTradingAccount = {
  _id?: string;
  id?: string;
  connectionStatus?: string;
  state?: string;
  region?: string;
  login?: string;
  server?: string;
  name?: string;
  type?: string;
};

function newTransactionId(): string {
  return randomBytes(16).toString("hex");
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function parseRetryAfterMs(res: Response): number | null {
  const ra = res.headers.get("Retry-After");
  if (!ra) return null;
  const asNum = Number(ra);
  if (!Number.isNaN(asNum) && asNum > 0) return Math.min(asNum * 1000, 120_000);
  const asDate = Date.parse(ra);
  if (!Number.isNaN(asDate)) {
    const delta = asDate - Date.now();
    if (delta > 0) return Math.min(delta, 120_000);
  }
  return 60_000;
}

export class MetaApiRequestError extends Error {
  readonly code: Mt5CloudErrorCode;
  readonly status: number;
  readonly payload: unknown;

  constructor(code: Mt5CloudErrorCode, message: string, status: number, payload: unknown) {
    super(message);
    this.code = code;
    this.status = status;
    this.payload = payload;
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  const { timeoutMs = 45_000, ...rest } = init;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...rest, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function authHeadersJson(): HeadersInit {
  const token = getMetaApiToken();
  if (!token) throw new MetaApiRequestError("provider_not_configured", "Missing MetaApi token", 0, null);
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    "auth-token": token,
  };
}

function authHeadersGet(): HeadersInit {
  const token = getMetaApiToken();
  if (!token) throw new MetaApiRequestError("provider_not_configured", "Missing MetaApi token", 0, null);
  return {
    Accept: "application/json",
    "auth-token": token,
  };
}

export async function provisioningGetAccount(accountId: string): Promise<MetaApiTradingAccount> {
  const base = getMetaApiProvisioningBaseUrl();
  const res = await fetchWithTimeout(`${base}/users/current/accounts/${encodeURIComponent(accountId)}`, {
    method: "GET",
    headers: authHeadersGet(),
    timeoutMs: 30_000,
  });
  const body = await readJson(res);
  if (!res.ok) {
    const code = res.status === 404 ? "not_found" : classifyHttpStatus(res.status);
    throw new MetaApiRequestError(code, `Provisioning read failed (${res.status})`, res.status, body);
  }
  return (body ?? {}) as MetaApiTradingAccount;
}

export async function provisioningListAccounts(): Promise<MetaApiTradingAccount[]> {
  const base = getMetaApiProvisioningBaseUrl();
  const res = await fetchWithTimeout(`${base}/users/current/accounts`, {
    method: "GET",
    headers: authHeadersGet(),
    timeoutMs: 30_000,
  });
  const body = await readJson(res);
  if (!res.ok) {
    const code = res.status === 401 ? "metaapi_auth_failed" : classifyHttpStatus(res.status);
    throw new MetaApiRequestError(code, `Provisioning list failed (${res.status})`, res.status, body);
  }
  return Array.isArray(body) ? (body as MetaApiTradingAccount[]) : [];
}

function normalizeMt5Login(login: string | number | null | undefined): string {
  return String(login ?? "").replace(/\D/g, "");
}

function normalizeMt5Server(server: string | null | undefined): string {
  return String(server ?? "").trim().toLowerCase();
}

export function metaApiTradingAccountId(account: MetaApiTradingAccount): string | null {
  const id = account.id ?? account._id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

export async function provisioningFindMt5CloudAccount(input: {
  login: string;
  server: string;
}): Promise<MetaApiTradingAccount | null> {
  const targetLogin = normalizeMt5Login(input.login);
  const targetServer = normalizeMt5Server(input.server);
  if (!targetLogin || !targetServer) return null;

  const accounts = await provisioningListAccounts();
  return (
    accounts.find((account) => {
      const sameLogin = normalizeMt5Login(account.login) === targetLogin;
      const sameServer = normalizeMt5Server(account.server) === targetServer;
      return sameLogin && sameServer && metaApiTradingAccountId(account) != null;
    }) ?? null
  );
}

export async function provisioningDeleteAccount(accountId: string): Promise<void> {
  const base = getMetaApiProvisioningBaseUrl();
  const res = await fetchWithTimeout(`${base}/users/current/accounts/${encodeURIComponent(accountId)}`, {
    method: "DELETE",
    headers: authHeadersGet(),
    timeoutMs: 60_000,
  });
  if (res.status === 204 || res.status === 404) return;
  const body = await readJson(res);
  const code = classifyHttpStatus(res.status);
  throw new MetaApiRequestError(code, `Delete account failed (${res.status})`, res.status, body);
}

async function provisioningPostAccountOperation(
  accountId: string,
  operation: "deploy" | "redeploy",
): Promise<MetaApiTradingAccount> {
  const base = getMetaApiProvisioningBaseUrl();
  const res = await fetchWithTimeout(
    `${base}/users/current/accounts/${encodeURIComponent(accountId)}/${operation}`,
    {
      method: "POST",
      headers: authHeadersJson(),
      timeoutMs: 60_000,
    },
  );
  const body = await readJson(res);
  if (!res.ok) {
    const code = res.status === 404 ? "not_found" : classifyHttpStatus(res.status);
    throw new MetaApiRequestError(code, `${operation} account failed (${res.status})`, res.status, body);
  }
  return (body ?? {}) as MetaApiTradingAccount;
}

export async function provisioningDeployAccount(accountId: string): Promise<MetaApiTradingAccount> {
  return provisioningPostAccountOperation(accountId, "deploy");
}

export async function provisioningRedeployAccount(accountId: string): Promise<MetaApiTradingAccount> {
  return provisioningPostAccountOperation(accountId, "redeploy");
}

export type CreateMt5CloudAccountInput = {
  login: string;
  password: string;
  name: string;
  server: string;
  region: string;
  /** Investor / read-only password path */
  manualTrades: true;
};

export async function provisioningCreateMt5CloudAccount(
  input: CreateMt5CloudAccountInput,
): Promise<{ id: string; state?: string }> {
  const base = getMetaApiProvisioningBaseUrl();
  const transactionId = newTransactionId();
  const bodyObj = {
    login: input.login.replace(/\D/g, ""),
    password: input.password,
    name: input.name,
    server: input.server.trim(),
    platform: "mt5",
    type: "cloud-g2",
    manualTrades: true,
    magic: 0,
    region: input.region,
  };

  const maxPasses = 40;
  for (let pass = 0; pass < maxPasses; pass++) {
    const res = await fetchWithTimeout(`${base}/users/current/accounts`, {
      method: "POST",
      headers: {
        ...authHeadersJson(),
        "transaction-id": transactionId,
      },
      body: JSON.stringify(bodyObj),
      timeoutMs: 60_000,
    });

    const body = await readJson(res);

    if (res.status === 201) {
      const id = (body as { id?: string })?.id;
      if (!id) throw new MetaApiRequestError("unknown", "Missing account id in response", res.status, body);
      return { id, state: (body as { state?: string }).state };
    }

    if (res.status === 202) {
      const wait = parseRetryAfterMs(res) ?? 15_000;
      await sleep(wait);
      continue;
    }

    if (res.status === 401) {
      throw new MetaApiRequestError("metaapi_auth_failed", "Unauthorized", res.status, body);
    }

    const classified = classifyMetaApiProvisioningError(body);
    if (classified !== "unknown") {
      throw new MetaApiRequestError(classified, "Provisioning validation failed", res.status, body);
    }

    if (res.status === 400 || res.status === 403) {
      throw new MetaApiRequestError(
        res.status === 403 ? "forbidden" : "validation",
        `Provisioning error (${res.status})`,
        res.status,
        body,
      );
    }

    throw new MetaApiRequestError(classifyHttpStatus(res.status), `Unexpected ${res.status}`, res.status, body);
  }

  throw new MetaApiRequestError("metaapi_timeout", "Provisioning still pending after retries", 0, null);
}

/**
 * All client-side MetaApi calls below accept an optional `region` argument
 * so we can route to the host where the account is actually deployed
 * (see metaApiRegions.ts). Callers should pass the value stored in
 * `user_broker_accounts.metadata.metaapiRegion`. Omitting it falls back to
 * the legacy env-driven default — works for single-region deployments,
 * but breaks for accounts in other regions, which is the whole reason
 * "sommige accounts kunnen niet koppelen" used to fail.
 */
export async function clientGetAccountInformation(
  accountId: string,
  refreshTerminalState: boolean,
  region?: string | null,
): Promise<Record<string, unknown>> {
  const base = getMetaApiClientBaseUrl(region);
  const q = refreshTerminalState ? "?refreshTerminalState=true" : "";
    const res = await fetchWithTimeout(
    `${base}/users/current/accounts/${encodeURIComponent(accountId)}/account-information${q}`,
    {
      method: "GET",
      headers: authHeadersGet(),
      timeoutMs: refreshTerminalState ? 90_000 : 45_000,
    },
  );
  const body = await readJson(res);
  if (res.status === 404) {
    throw new MetaApiRequestError("not_found", "Account not provisioned on this client region", res.status, body);
  }
  if (!res.ok) {
    const code = res.status === 401 ? "metaapi_auth_failed" : "metaapi_region_error";
    throw new MetaApiRequestError(code, `Client API error (${res.status})`, res.status, body);
  }
  return (body ?? {}) as Record<string, unknown>;
}

export async function clientGetPositions(
  accountId: string,
  refreshTerminalState: boolean,
  region?: string | null,
): Promise<unknown[]> {
  const base = getMetaApiClientBaseUrl(region);
  const q = refreshTerminalState ? "?refreshTerminalState=true" : "";
    const res = await fetchWithTimeout(
    `${base}/users/current/accounts/${encodeURIComponent(accountId)}/positions${q}`,
    {
      method: "GET",
      headers: authHeadersGet(),
      timeoutMs: 60_000,
    },
  );
  const body = await readJson(res);
  if (!res.ok) {
    throw new MetaApiRequestError(classifyHttpStatus(res.status), `Positions ${res.status}`, res.status, body);
  }
  return Array.isArray(body) ? body : [];
}

/**
 * Fetch pending orders (buy-limit, sell-limit, buy-stop, sell-stop, etc.)
 * from MetaApi client API. These are NOT open positions — they are orders
 * waiting to be triggered.
 */
export async function clientGetOrders(
  accountId: string,
  refreshTerminalState: boolean,
  region?: string | null,
): Promise<unknown[]> {
  const base = getMetaApiClientBaseUrl(region);
  const q = refreshTerminalState ? "?refreshTerminalState=true" : "";
  const res = await fetchWithTimeout(
    `${base}/users/current/accounts/${encodeURIComponent(accountId)}/orders${q}`,
    {
      method: "GET",
      headers: authHeadersGet(),
      timeoutMs: 60_000,
    },
  );
  const body = await readJson(res);
  if (!res.ok) {
    throw new MetaApiRequestError(classifyHttpStatus(res.status), `Orders ${res.status}`, res.status, body);
  }
  return Array.isArray(body) ? body : [];
}

export async function clientListSymbols(
  accountId: string,
  region?: string | null,
): Promise<string[]> {
  const base = getMetaApiClientBaseUrl(region);
  const res = await fetchWithTimeout(
    `${base}/users/current/accounts/${encodeURIComponent(accountId)}/symbols`,
    {
      method: "GET",
      headers: authHeadersGet(),
      timeoutMs: 20_000,
    },
  );
  const body = await readJson(res);
  if (!res.ok) {
    throw new MetaApiRequestError(classifyHttpStatus(res.status), `Symbols ${res.status}`, res.status, body);
  }
  if (!Array.isArray(body)) return [];
  return body
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        const obj = item as { symbol?: unknown; name?: unknown };
        return typeof obj.symbol === "string" ? obj.symbol : typeof obj.name === "string" ? obj.name : "";
      }
      return "";
    })
    .map((s) => s.trim())
    .filter(Boolean);
}

export type MetaApiSymbolPrice = {
  symbol: string;
  bid: number | null;
  ask: number | null;
  brokerTime: string | null;
  time: string | null;
};

/** Lightweight latest price for a broker symbol via MetaApi client API. */
export async function clientGetSymbolPrice(
  accountId: string,
  symbol: string,
  region?: string | null,
): Promise<MetaApiSymbolPrice> {
  const base = getMetaApiClientBaseUrl(region);
  const sym = encodeURIComponent(symbol);
  const url = `${base}/users/current/accounts/${encodeURIComponent(accountId)}/symbols/${sym}/current-price`;
  const res = await fetchWithTimeout(url, {
    method: "GET",
    headers: authHeadersGet(),
    timeoutMs: 20_000,
  });
  const body = await readJson(res);
  if (!res.ok) {
    throw new MetaApiRequestError(classifyHttpStatus(res.status), `Symbol price ${res.status}`, res.status, body);
  }
  const r = (body ?? {}) as { bid?: number; ask?: number; time?: string; brokerTime?: string };
  return {
    symbol,
    bid: r.bid != null ? Number(r.bid) : null,
    ask: r.ask != null ? Number(r.ask) : null,
    brokerTime: r.brokerTime ?? null,
    time: r.time ?? null,
  };
}

export async function clientGetHistoryDealsRange(
  accountId: string,
  startIso: string,
  endIso: string,
  region?: string | null,
): Promise<unknown[]> {
  const base = getMetaApiClientBaseUrl(region);
  const s = encodeURIComponent(startIso);
  const e = encodeURIComponent(endIso);
  const all: unknown[] = [];
  let offset = 0;
  const limit = 1000;
  for (;;) {
    const url = `${base}/users/current/accounts/${encodeURIComponent(accountId)}/history-deals/time/${s}/${e}?offset=${offset}&limit=${limit}`;
    const res = await fetchWithTimeout(url, {
      method: "GET",
      headers: authHeadersGet(),
      timeoutMs: 120_000,
    });
    const body = await readJson(res);
    if (!res.ok) {
      throw new MetaApiRequestError(classifyHttpStatus(res.status), `History deals ${res.status}`, res.status, body);
    }
    const chunk = Array.isArray(body) ? body : [];
    all.push(...chunk);
    if (chunk.length < limit) break;
    offset += limit;
  }
  return all;
}

export function defaultRegionForProvisioning(): string {
  return getMetaApiDefaultRegion();
}

export type MetaApiCandle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  /** MT5 tick volume for the candle, when MetaApi returns it. */
  tickVolume?: number;
  /** Some MetaApi/broker responses expose volume under this field. */
  volume?: number;
  spread?: number;
};

// ────────────────────────────────────────────────────────────────────────────
//   TRADE
// ────────────────────────────────────────────────────────────────────────────

export type MetaApiOrderType =
  | "ORDER_TYPE_BUY"
  | "ORDER_TYPE_SELL"
  | "ORDER_TYPE_BUY_LIMIT"
  | "ORDER_TYPE_SELL_LIMIT"
  | "ORDER_TYPE_BUY_STOP"
  | "ORDER_TYPE_SELL_STOP";

export type PlaceOrderInput = {
  accountId: string;
  symbol: string;
  /** MetaApi action types — straight from MT5 terminology. */
  actionType: MetaApiOrderType;
  /** Lots, e.g. 0.10. */
  volume: number;
  /** Required for any *_LIMIT / *_STOP order. Ignored for market BUY/SELL. */
  openPrice?: number | null;
  stopLoss?: number | null;
  takeProfit?: number | null;
  /** Slippage in points (deviation in MT5). */
  slippage?: number | null;
  /** Optional MT5 magic number — used by the EA to tag AXE-originated orders. */
  magic?: number | null;
  /** Free-form comment, max ~31 chars (MT5 limit). */
  comment?: string | null;
  /**
   * MetaApi region the account is deployed in (london / new-york / singapore).
   * Required for accounts outside the default region — otherwise the trade
   * POST hits the wrong host and 404s with `metaapi_region_error`.
   */
  region?: string | null;
};

export type PlaceOrderResult = {
  /** "TRADE_RETCODE_DONE" / "DONE_PARTIAL" mean successful in MT5 land. */
  stringCode?: string;
  numericCode?: number;
  message?: string;
  orderId?: string;
  positionId?: string;
  raw: Record<string, unknown>;
};

/**
 * POST a single trade action to MetaApi's `/users/current/accounts/{id}/trade`.
 *
 * This is the only path real broker orders flow through. Live execution is
 * additionally gated client-side via the live-trading flag and the chart's
 * final-confirm modal, and server-side via the Supabase auth + ownership
 * check in /api/mt5/order.
 */
export async function clientPlaceOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  const base = getMetaApiClientBaseUrl(input.region);
  const url = `${base}/users/current/accounts/${encodeURIComponent(input.accountId)}/trade`;
  const body: Record<string, unknown> = {
    actionType: input.actionType,
    symbol: input.symbol,
    volume: input.volume,
  };
  if (input.openPrice != null && Number.isFinite(input.openPrice)) {
    body.openPrice = input.openPrice;
  }
  if (input.stopLoss != null && Number.isFinite(input.stopLoss)) {
    body.stopLoss = input.stopLoss;
  }
  if (input.takeProfit != null && Number.isFinite(input.takeProfit)) {
    body.takeProfit = input.takeProfit;
  }
  if (input.slippage != null && Number.isFinite(input.slippage)) {
    body.slippage = input.slippage;
  }
  if (input.magic != null && Number.isFinite(input.magic)) {
    body.magic = input.magic;
  }
  if (input.comment) {
    body.comment = String(input.comment).slice(0, 31);
  }

  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: authHeadersJson(),
    body: JSON.stringify(body),
    timeoutMs: 45_000,
  });
  const payload = await readJson(res);
  const obj = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;

  if (!res.ok) {
    const code = res.status === 401 ? "metaapi_auth_failed" : classifyHttpStatus(res.status);
    throw new MetaApiRequestError(
      code,
      `Trade failed (${res.status})`,
      res.status,
      obj,
    );
  }

  return {
    stringCode: typeof obj.stringCode === "string" ? obj.stringCode : undefined,
    numericCode: typeof obj.numericCode === "number" ? obj.numericCode : undefined,
    message: typeof obj.message === "string" ? obj.message : undefined,
    orderId: typeof obj.orderId === "string" ? obj.orderId : undefined,
    positionId: typeof obj.positionId === "string" ? obj.positionId : undefined,
    raw: obj,
  };
}

// ────────────────────────────────────────────────────────────────────────────
//   MARKET DATA
// ────────────────────────────────────────────────────────────────────────────

/** OHLC from MT5 terminal via MetaApi market-data host (not the trade REST host). */
export async function clientGetHistoricalCandles(
  accountId: string,
  symbol: string,
  timeframe: string,
  limit: number,
  region?: string | null,
): Promise<MetaApiCandle[]> {
  const base = getMetaApiMarketDataBaseUrl(region);
  const sym = encodeURIComponent(symbol);
  const tf = encodeURIComponent(timeframe);
  const lim = Math.min(Math.max(1, limit), 1000);
  const url = `${base}/users/current/accounts/${encodeURIComponent(accountId)}/historical-market-data/symbols/${sym}/timeframes/${tf}/candles?limit=${lim}`;
  const res = await fetchWithTimeout(url, {
    method: "GET",
    headers: authHeadersGet(),
    timeoutMs: 120_000,
  });
  const body = await readJson(res);
  if (!res.ok) {
    throw new MetaApiRequestError(classifyHttpStatus(res.status), `Candles ${res.status}`, res.status, body);
  }
  if (!Array.isArray(body)) return [];
  return (body as MetaApiCandle[]).map((c) => ({
    time: String(c.time ?? ""),
    open: Number(c.open) || 0,
    high: Number(c.high) || 0,
    low: Number(c.low) || 0,
    close: Number(c.close) || 0,
    tickVolume: c.tickVolume != null ? Number(c.tickVolume) : undefined,
    volume: c.volume != null ? Number(c.volume) : undefined,
    spread: c.spread != null ? Number(c.spread) : undefined,
  }));
}
