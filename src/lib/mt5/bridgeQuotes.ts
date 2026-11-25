/**
 * Live prices for accounts on our own MT5 bridge (services/mt5-bridge).
 *
 * `chart_live_snapshots` is where both apps read a live price: the Quotes
 * page, Trading OS's watchlist, bid/ask and the last tick on its chart. For
 * MetaApi accounts the streamer (node/metaapi-streamer) fills it from
 * MetaApi's socket. The bridge has no socket, so an account on the bridge got
 * no rows at all, and Trading OS read "No quote" for every symbol (Luka's
 * Upcomers account, 25 Nov 2026).
 *
 * `/api/cron/bridge-quotes` runs this once a minute: for about 55 seconds it
 * asks the bridge for the current price of the symbols that matter and
 * writes the same rows the streamer writes. Every 3 s for the watchlist and
 * open positions, every 15 s for the rest of the account's mapped symbols.
 * A price that did not change is not written again, except as a heartbeat.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getMetadataSymbolMap } from "@/lib/broker/brokerSymbolRuntime";
import { cleanDisplaySymbol } from "@/lib/broker/symbolResolution";
import { getMt5BridgeConfig, isBridgeRegion, type Mt5BridgeConfig } from "@/lib/mt5/mt5Bridge";

export type BridgeQuoteTarget = {
  /** What the apps call it (XAUUSD, BRENT). */
  display: string;
  /** What the broker calls it (XAUUSD, UKOIL.c). */
  broker: string;
  /** Watchlist or open position: every cycle. Otherwise every few cycles. */
  fast: boolean;
};

export type BridgePrice = { bid: number | null; ask: number | null; time: string | null };

/** Most symbols one account polls; the bridge is a single small terminal. */
export const BRIDGE_QUOTE_LIMIT = 24;

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((s): s is string => typeof s === "string" && s.trim() !== "") : [];
}

function positionSymbols(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((p) => (p && typeof p === "object" ? (p as Record<string, unknown>).symbol : null))
    .filter((s): s is string => typeof s === "string" && s.trim() !== "");
}

/**
 * Which symbols to keep live for one bridge account, from what the sync has
 * already stored on it: the watchlist quotes and open positions first (fast),
 * then the rest of the symbol map (slow). Each broker symbol and each display
 * name appears once.
 */
export function bridgeQuoteTargets(
  metadata: Record<string, unknown> | null | undefined,
  limit = BRIDGE_QUOTE_LIMIT,
): BridgeQuoteTarget[] {
  const meta = metadata ?? {};
  const map = getMetadataSymbolMap(meta);
  const displayFor = new Map<string, string>();
  for (const [display, broker] of Object.entries(map)) {
    const key = broker.toUpperCase();
    if (!displayFor.has(key)) displayFor.set(key, display);
  }

  const byBroker = new Map<string, BridgeQuoteTarget>();
  const usedDisplays = new Set<string>();
  const add = (rawBroker: string, fast: boolean) => {
    const broker = rawBroker.trim();
    const key = broker.toUpperCase();
    const existing = byBroker.get(key);
    if (existing) {
      if (fast) existing.fast = true;
      return;
    }
    const display = (displayFor.get(key) ?? (cleanDisplaySymbol(broker) || key)).toUpperCase();
    // Two broker names cleaning to one display would fight over one row.
    if (usedDisplays.has(display)) return;
    usedDisplays.add(display);
    byBroker.set(key, { display, broker, fast });
  };

  for (const s of strings(meta.mt5_quotes_symbols)) add(s, true);
  for (const s of positionSymbols(meta.openPositions)) add(s, true);
  for (const broker of Object.values(map)) add(broker, false);

  const all = [...byBroker.values()];
  return [...all.filter((t) => t.fast), ...all.filter((t) => !t.fast)].slice(0, limit);
}

function positive(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** The bridge's current-price answer as bid / ask / UTC time; null when it carries no price. */
export function parseBridgePrice(body: unknown): BridgePrice | null {
  if (!body || typeof body !== "object") return null;
  const r = body as Record<string, unknown>;
  const bid = positive(r.bid);
  const ask = positive(r.ask);
  if (bid == null && ask == null) return null;
  const time = typeof r.time === "string" && Number.isFinite(Date.parse(r.time)) ? r.time : null;
  return { bid, ask, time };
}

/** One `chart_live_snapshots` row, the same shape the MetaApi streamer writes. */
export function bridgeSnapshotRow(input: {
  userId: string;
  accountId: string;
  target: BridgeQuoteTarget;
  price: BridgePrice;
  nowIso: string;
}) {
  const { price } = input;
  return {
    user_id: input.userId,
    account_id: input.accountId,
    display_symbol: input.target.display,
    broker_symbol: input.target.broker,
    timeframe: "quote",
    last_price: price.bid ?? price.ask,
    last_bid: price.bid,
    last_ask: price.ask,
    // UTC, like MetaApi's tick time: Trading OS works out a broker clock
    // offset from last_tick_at vs updated_at and finds zero here.
    last_tick_at: price.time ?? input.nowIso,
    status: "live",
    source: "mt5_bridge",
    updated_at: input.nowIso,
  };
}

/** Write again only when the price moved, or as a heartbeat so a quiet market still reads as current. */
export function shouldWrite(
  previous: { bid: number | null; ask: number | null; time: string | null; at: number } | undefined,
  next: BridgePrice,
  nowMs: number,
  heartbeatMs: number,
): boolean {
  if (!previous) return true;
  if (previous.bid !== next.bid || previous.ask !== next.ask || previous.time !== next.time) return true;
  return nowMs - previous.at >= heartbeatMs;
}

type AccountRow = {
  id: string;
  user_id: string;
  external_connection_id: string | null;
  status: string | null;
  metadata: Record<string, unknown> | null;
};

export type BridgeQuoteLoopSummary = {
  ok: boolean;
  reason?: string;
  accounts: number;
  symbols: number;
  cycles: number;
  fetched: number;
  written: number;
  failed: number;
  lastError?: string;
  stoppedEarly?: string;
};

export type BridgeQuoteLoopOptions = {
  durationMs?: number;
  fastMs?: number;
  /** The slow symbols ride along on every Nth cycle. */
  slowEvery?: number;
  heartbeatMs?: number;
  fetchPrice?: (cfg: Mt5BridgeConfig, broker: string) => Promise<BridgePrice | null>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

async function fetchBridgePrice(cfg: Mt5BridgeConfig, broker: string): Promise<BridgePrice | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5_000);
  try {
    const url = `${cfg.url}/users/current/accounts/${encodeURIComponent(cfg.accountId)}/symbols/${encodeURIComponent(broker)}/current-price`;
    const res = await fetch(url, { headers: { Accept: "application/json", "auth-token": cfg.token }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`bridge price ${res.status}`);
    return parseBridgePrice(await res.json().catch(() => null));
  } finally {
    clearTimeout(timer);
  }
}

/** The bridge accounts this host serves: on the bridge region, with the bridge's own account id. */
async function loadBridgeAccounts(db: SupabaseClient, cfg: Mt5BridgeConfig): Promise<AccountRow[]> {
  const { data, error } = await db
    .from("user_broker_accounts")
    .select("id,user_id,external_connection_id,status,metadata")
    .eq("connection_method", "cloud_mt5")
    .eq("external_connection_id", cfg.accountId);
  if (error) throw new Error(error.message);
  return ((data ?? []) as AccountRow[]).filter(
    (row) => row.status !== "inactive" && isBridgeRegion(String(row.metadata?.metaapiRegion ?? "")),
  );
}

export async function runBridgeQuoteLoop(
  db: SupabaseClient,
  opts: BridgeQuoteLoopOptions = {},
): Promise<BridgeQuoteLoopSummary> {
  const durationMs = opts.durationMs ?? 55_000;
  const fastMs = opts.fastMs ?? 3_000;
  const slowEvery = Math.max(1, opts.slowEvery ?? 5);
  const heartbeatMs = opts.heartbeatMs ?? 30_000;
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const fetchPrice = opts.fetchPrice ?? fetchBridgePrice;
  const summary: BridgeQuoteLoopSummary = { ok: true, accounts: 0, symbols: 0, cycles: 0, fetched: 0, written: 0, failed: 0 };

  const cfg = getMt5BridgeConfig();
  if (!cfg) return { ...summary, ok: false, reason: "bridge_not_configured" };

  let accounts: AccountRow[];
  try {
    accounts = await loadBridgeAccounts(db, cfg);
  } catch (e) {
    return { ...summary, ok: false, reason: `accounts_unreadable: ${e instanceof Error ? e.message : String(e)}` };
  }
  const plans = accounts
    .map((row) => ({ row, targets: bridgeQuoteTargets(row.metadata) }))
    .filter((p) => p.targets.length > 0);
  summary.accounts = plans.length;
  summary.symbols = plans.reduce((n, p) => n + p.targets.length, 0);
  if (plans.length === 0) return { ...summary, reason: accounts.length ? "no_symbols" : "no_bridge_accounts" };

  // One terminal answers every account here, so a symbol is fetched once per cycle.
  const lastWrite = new Map<string, { bid: number | null; ask: number | null; time: string | null; at: number }>();
  const start = now();
  let failingCycles = 0;

  while (now() - start < durationMs) {
    const cycleStart = now();
    summary.cycles += 1;
    const includeSlow = (summary.cycles - 1) % slowEvery === 0;
    const brokers = new Set<string>();
    for (const p of plans) for (const t of p.targets) if (t.fast || includeSlow) brokers.add(t.broker);

    const prices = new Map<string, BridgePrice>();
    await Promise.all(
      [...brokers].map(async (broker) => {
        try {
          const price = await fetchPrice(cfg, broker);
          if (price) {
            prices.set(broker, price);
            summary.fetched += 1;
          }
        } catch (e) {
          summary.failed += 1;
          summary.lastError = e instanceof Error ? e.message : String(e);
        }
      }),
    );

    if (prices.size === 0 && brokers.size > 0) {
      failingCycles += 1;
      // Bridge down or the terminal not logged in: stop asking until the next minute.
      if (failingCycles >= 3) {
        summary.stoppedEarly = "bridge_not_answering";
        break;
      }
    } else {
      failingCycles = 0;
    }

    const nowMs = now();
    const nowIso = new Date(nowMs).toISOString();
    const rows = [];
    for (const p of plans) {
      for (const t of p.targets) {
        const price = prices.get(t.broker);
        if (!price) continue;
        const key = `${p.row.id}:${t.display}`;
        if (!shouldWrite(lastWrite.get(key), price, nowMs, heartbeatMs)) continue;
        rows.push(bridgeSnapshotRow({ userId: p.row.user_id, accountId: p.row.id, target: t, price, nowIso }));
        lastWrite.set(key, { ...price, at: nowMs });
      }
    }
    if (rows.length) {
      const { error } = await db
        .from("chart_live_snapshots")
        .upsert(rows, { onConflict: "user_id,account_id,display_symbol,timeframe" });
      if (error) {
        summary.lastError = `write: ${error.message}`;
        summary.failed += rows.length;
        // The next cycle writes these again.
        for (const r of rows) lastWrite.delete(`${r.account_id}:${r.display_symbol}`);
      } else {
        summary.written += rows.length;
      }
    }

    const wait = fastMs - (now() - cycleStart);
    if (now() - start + Math.max(0, wait) >= durationMs) break;
    if (wait > 0) await sleep(wait);
  }

  return summary;
}
