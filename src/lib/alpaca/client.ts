import type { AlpacaEnvConfig } from "@/lib/alpaca/env";
import type { AlpacaAccount, AlpacaBar, AlpacaOrder, AlpacaPosition } from "@/lib/alpaca/types";

export class AlpacaApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly payload?: unknown,
  ) {
    super(message);
    this.name = "AlpacaApiError";
  }
}

function authHeaders(config: AlpacaEnvConfig): HeadersInit {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    "APCA-API-KEY-ID": config.keyId,
    "APCA-API-SECRET-KEY": config.secretKey,
  };
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

async function alpacaFetch<T>(
  config: AlpacaEnvConfig,
  base: "trading" | "data",
  path: string,
  init?: RequestInit,
): Promise<T> {
  const root = base === "trading" ? config.tradingBaseUrl : config.dataBaseUrl;
  const url = `${root.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      ...authHeaders(config),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  const payload = await readJson(res);
  if (!res.ok) {
    const obj = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
    const message =
      (typeof obj.message === "string" && obj.message) ||
      (typeof obj.error === "string" && obj.error) ||
      `Alpaca request failed (${res.status})`;
    throw new AlpacaApiError(message, res.status, typeof obj.code === "string" ? obj.code : undefined, payload);
  }

  return payload as T;
}

export async function getAlpacaAccount(config: AlpacaEnvConfig): Promise<AlpacaAccount> {
  return alpacaFetch(config, "trading", "/v2/account");
}

export async function listAlpacaOrders(
  config: AlpacaEnvConfig,
  params?: { status?: string; symbols?: string; limit?: number },
): Promise<AlpacaOrder[]> {
  const q = new URLSearchParams();
  if (params?.status) q.set("status", params.status);
  if (params?.symbols) q.set("symbols", params.symbols);
  if (params?.limit) q.set("limit", String(params.limit));
  const suffix = q.toString() ? `?${q.toString()}` : "";
  return alpacaFetch(config, "trading", `/v2/orders${suffix}`);
}

export async function listAlpacaPositions(config: AlpacaEnvConfig): Promise<AlpacaPosition[]> {
  return alpacaFetch(config, "trading", "/v2/positions");
}

export type CreateAlpacaOrderInput = {
  symbol: string;
  qty: number;
  side: "buy" | "sell";
  type: "market" | "limit" | "stop" | "stop_limit";
  time_in_force?: "day" | "gtc";
  limit_price?: number;
  stop_price?: number;
  client_order_id?: string;
  order_class?: "simple" | "bracket" | "oco" | "oto";
  take_profit?: { limit_price: number };
  stop_loss?: { stop_price: number; limit_price?: number };
};

export async function createAlpacaOrder(
  config: AlpacaEnvConfig,
  input: CreateAlpacaOrderInput,
): Promise<AlpacaOrder> {
  return alpacaFetch(config, "trading", "/v2/orders", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function replaceAlpacaOrder(
  config: AlpacaEnvConfig,
  orderId: string,
  input: Partial<CreateAlpacaOrderInput>,
): Promise<AlpacaOrder> {
  return alpacaFetch(config, "trading", `/v2/orders/${encodeURIComponent(orderId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function cancelAlpacaOrder(config: AlpacaEnvConfig, orderId: string): Promise<void> {
  await alpacaFetch(config, "trading", `/v2/orders/${encodeURIComponent(orderId)}`, {
    method: "DELETE",
  });
}

export async function cancelAllAlpacaOrders(config: AlpacaEnvConfig): Promise<void> {
  await alpacaFetch(config, "trading", "/v2/orders", { method: "DELETE" });
}

export async function closeAllAlpacaPositions(config: AlpacaEnvConfig): Promise<void> {
  await alpacaFetch(config, "trading", "/v2/positions", { method: "DELETE" });
}

export type AlpacaSnapshot = {
  latestTrade?: { p?: number; t?: string };
  latestQuote?: { bp?: number; ap?: number; t?: string };
  minuteBar?: { c?: number; t?: string };
};

export async function getAlpacaSnapshots(
  config: AlpacaEnvConfig,
  symbols: string[],
  feed: "iex" | "sip" = "iex",
): Promise<Record<string, AlpacaSnapshot>> {
  const list = symbols.map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (list.length === 0) return {};
  const q = new URLSearchParams();
  q.set("symbols", list.join(","));
  q.set("feed", feed);
  return alpacaFetch<Record<string, AlpacaSnapshot>>(
    config,
    "data",
    `/v2/stocks/snapshots?${q.toString()}`,
  );
}

export async function getAlpacaBars(
  config: AlpacaEnvConfig,
  symbol: string,
  params: {
    timeframe: string;
    start?: string;
    end?: string;
    limit?: number;
    adjustment?: "raw" | "split" | "dividend" | "all";
    /** IEX is free; SIP requires a paid subscription. */
    feed?: "iex" | "sip" | "boats";
  },
): Promise<AlpacaBar[]> {
  const q = new URLSearchParams();
  q.set("timeframe", params.timeframe);
  q.set("feed", params.feed ?? "iex");
  if (params.start) q.set("start", params.start);
  if (params.end) q.set("end", params.end);
  if (params.limit) q.set("limit", String(params.limit));
  if (params.adjustment) q.set("adjustment", params.adjustment);

  const payload = await alpacaFetch<{ bars?: AlpacaBar[] }>(
    config,
    "data",
    `/v2/stocks/${encodeURIComponent(symbol)}/bars?${q.toString()}`,
  );
  return payload.bars ?? [];
}
