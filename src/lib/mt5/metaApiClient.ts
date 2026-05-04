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

export async function clientGetAccountInformation(
  accountId: string,
  refreshTerminalState: boolean,
): Promise<Record<string, unknown>> {
  const base = getMetaApiClientBaseUrl();
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

export async function clientGetPositions(accountId: string, refreshTerminalState: boolean): Promise<unknown[]> {
  const base = getMetaApiClientBaseUrl();
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

export async function clientGetHistoryDealsRange(
  accountId: string,
  startIso: string,
  endIso: string,
): Promise<unknown[]> {
  const base = getMetaApiClientBaseUrl();
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
};

/** OHLC from MT5 terminal via MetaApi market-data host (not the trade REST host). */
export async function clientGetHistoricalCandles(
  accountId: string,
  symbol: string,
  timeframe: string,
  limit: number,
): Promise<MetaApiCandle[]> {
  const base = getMetaApiMarketDataBaseUrl();
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
  }));
}
