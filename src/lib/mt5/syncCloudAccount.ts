import "server-only";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { autoJournalTrades } from "@/services/journalingService";
import { normalizeDealsToClosedTrades, type MetaApiDeal } from "@/lib/mt5/dealNormalization";
import { userMessageForCode, type Mt5CloudErrorCode } from "@/lib/mt5/metaApiErrors";
import { getMetaApiToken } from "@/lib/mt5/metaApiEnv";
import {
  clientGetAccountInformation,
  clientGetHistoryDealsRange,
  clientListSymbols,
  clientGetPositions,
  metaApiTradingAccountId,
  MetaApiRequestError,
  provisioningFindMt5CloudAccount,
  provisioningGetAccount,
  type MetaApiTradingAccount,
} from "@/lib/mt5/metaApiClient";
import {
  buildBrokerSymbolRuntimeMetadata,
  CANONICAL_BROKER_SYMBOLS,
  metadataHasSymbolMap,
  probeBrokerSymbolReport,
} from "@/lib/broker/brokerSymbolRuntime";
import { cleanDisplaySymbol } from "@/lib/broker/symbolResolution";
import { chartDeepLink } from "@/lib/feed/feedDeepLinks";
import { recordProactiveFeedEvent } from "@/lib/feed/recordProactiveFeedEvent";
import { withActionBudget } from "@/lib/mt5/mt5ActionBudget";
import { mapMetaApiActionError } from "@/lib/mt5/mapMetaApiActionError";

export type CloudMt5SyncResult =
  | { ok: true; data: { dealsFetched: number; dealsUpserted: number; tradesNormalized: number } }
  | { ok: false; code: Mt5CloudErrorCode; message: string };

const TEST_PROVISIONING_TIMEOUT_MS = 20_000;
const SYNC_ACCOUNT_INFO_TIMEOUT_MS = 35_000;
const SYNC_POSITIONS_TIMEOUT_MS = 35_000;
const SYNC_HISTORY_TIMEOUT_MS = 75_000;
const SYNC_FINAL_STATUS_TIMEOUT_MS = 10_000;
const SYMBOL_LIST_TIMEOUT_MS = 12_000;
const SYMBOL_PROBE_TIMEOUT_MS = 1_800;

export type SymbolMapRefreshResult =
  | { ok: true; data: { mappedCount: number; universeSize: number } }
  | { ok: false; code: Mt5CloudErrorCode; message: string };

export type RefreshCloudAccountSymbolMapOptions = {
  /** Probe prices/candles for canonical symbols (default true). */
  probe?: boolean;
};

function normalizeLogin(login: string | number | null | undefined): string {
  return String(login ?? "").replace(/\D/g, "");
}

function normalizeServer(server: string | null | undefined): string {
  return String(server ?? "").trim().toLowerCase();
}

function accountMatchesMt5(
  account: MetaApiTradingAccount,
  login: string | number | null | undefined,
  server: string | null | undefined,
): boolean {
  const targetLogin = normalizeLogin(login);
  const targetServer = normalizeServer(server);
  if (!targetLogin || !targetServer) return false;
  return normalizeLogin(account.login) === targetLogin && normalizeServer(account.server) === targetServer;
}

async function findExistingMetaApiAccount(
  login: string,
  server: string,
): Promise<{ id: string; account: MetaApiTradingAccount } | null> {
  const account = await provisioningFindMt5CloudAccount({ login, server });
  if (!account) return null;
  const id = metaApiTradingAccountId(account);
  return id ? { id, account } : null;
}

function mapConnectionToProviderStatus(
  connectionStatus: string | undefined,
  state: string | undefined,
): string {
  const c = (connectionStatus ?? "").toUpperCase();
  if (c === "CONNECTED") return "connected";
  if (c === "DISCONNECTED") return "disconnected";
  if (c === "CONNECTING") return "connecting";
  const s = (state ?? "").toUpperCase();
  if (s === "DEPLOYED") return "provisioned";
  return (connectionStatus ?? state ?? "unknown").toLowerCase();
}

export type RunCloudMt5SyncOptions = {
  /** Revalidate Next.js paths after a successful sync (user-initiated sync). */
  revalidate?: boolean;
  /** Trigger AXE auto-journal for new trades (default true). */
  autoJournal?: boolean;
  /** Treat zero deals as success for background/cron sync. */
  allowEmptyDeals?: boolean;
};

/**
 * Core MetaAPI → Supabase sync for a single cloud_mt5 account.
 * Used by the manual Sync button, Vercel cron, and stale-sync triggers.
 */
export async function runCloudMt5Sync(
  supabase: SupabaseClient,
  userId: string,
  accountId: string,
  opts: RunCloudMt5SyncOptions = {},
): Promise<CloudMt5SyncResult> {
  if (!getMetaApiToken()) {
    return { ok: false, code: "provider_not_configured", message: userMessageForCode("provider_not_configured") };
  }

  const { data: row, error } = await supabase
    .from("user_broker_accounts")
    .select("id,external_connection_id,connection_method,metadata,user_id,mt5_login,mt5_server")
    .eq("id", accountId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return { ok: false, code: "unknown", message: error.message };
  if (!row?.external_connection_id || row.connection_method !== "cloud_mt5") {
    return { ok: false, code: "validation", message: "Not a MetaApi cloud account." };
  }

  let extId = row.external_connection_id as string;
  const prevMeta = (row.metadata ?? {}) as Record<string, unknown>;
  let accountRegion =
    typeof prevMeta.metaapiRegion === "string" ? prevMeta.metaapiRegion : null;

  await supabase
    .from("user_broker_accounts")
    .update({ provider_status: "syncing" })
    .eq("id", accountId)
    .eq("user_id", userId);

  let dealsRaw: unknown[] = [];
  let positions: unknown[] = [];
  let info: Record<string, unknown> = {};
  let brokerSymbols: string[] = [];
  let relinked = false;

  try {
    const mt5Login = normalizeLogin(row.mt5_login as string | null);
    const mt5Server = String(row.mt5_server ?? "").trim();
    let acc: MetaApiTradingAccount | null = null;
    try {
      acc = await withActionBudget(
        "sync_read_account",
        provisioningGetAccount(extId),
        SYNC_FINAL_STATUS_TIMEOUT_MS,
      );
    } catch (e) {
      const mapped = mapMetaApiActionError(e);
      if (mapped.code !== "not_found") throw e;
    }
    if (!acc || !accountMatchesMt5(acc, mt5Login, mt5Server)) {
      const existing = await withActionBudget(
        "find_existing_metaapi_account",
        findExistingMetaApiAccount(mt5Login, mt5Server),
        TEST_PROVISIONING_TIMEOUT_MS,
      );
      if (!existing) {
        throw new MetaApiRequestError(
          "not_found",
          "No matching MetaApi account found for MT5 login/server",
          404,
          null,
        );
      }
      extId = existing.id;
      acc = existing.account;
      relinked = true;
    }
    if (typeof acc.region === "string" && acc.region.length > 0) {
      accountRegion = acc.region;
    }

    info = await withActionBudget(
      "sync_account_information",
      clientGetAccountInformation(extId, true, accountRegion),
      SYNC_ACCOUNT_INFO_TIMEOUT_MS,
    );
    positions = await withActionBudget(
      "sync_positions",
      clientGetPositions(extId, false, accountRegion),
      SYNC_POSITIONS_TIMEOUT_MS,
    );
    try {
      brokerSymbols = await withActionBudget(
        "sync_symbols",
        clientListSymbols(extId, accountRegion),
        12_000,
      );
    } catch {
      brokerSymbols = [];
    }
    const end = new Date();
    const start = new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000);
    dealsRaw = await withActionBudget(
      "sync_history_deals",
      clientGetHistoryDealsRange(extId, start.toISOString(), end.toISOString(), accountRegion),
      SYNC_HISTORY_TIMEOUT_MS,
    );
  } catch (e) {
    await supabase
      .from("user_broker_accounts")
      .update({
        provider_status: "sync_failed",
        metadata: { ...prevMeta, lastSyncErrorAt: new Date().toISOString() },
      })
      .eq("id", accountId)
      .eq("user_id", userId);
    const m = mapMetaApiActionError(e);
    if (m.code === "unknown") {
      return { ok: false, code: "sync_failed", message: userMessageForCode("sync_failed") };
    }
    return m;
  }

  const dealsFetched = dealsRaw.length;
  const normalized = normalizeDealsToClosedTrades(dealsRaw as MetaApiDeal[]);
  const tradesNormalized = normalized.length;

  let dealsUpserted = 0;
  for (const t of normalized) {
    const payload = {
      user_id: userId,
      account_id: accountId,
      symbol: t.symbol,
      side: t.side,
      volume: t.volume,
      open_time: t.open_time,
      close_time: t.close_time,
      open_price: t.open_price,
      close_price: t.close_price,
      pnl: t.pnl,
      fees: t.fees,
      external_trade_id: t.external_trade_id,
      raw: t.raw,
    };

    const { data: existing, error: exErr } = await supabase
      .from("broker_trades")
      .select("id")
      .eq("account_id", accountId)
      .eq("external_trade_id", t.external_trade_id)
      .maybeSingle();

    if (exErr) {
      await supabase
        .from("user_broker_accounts")
        .update({ provider_status: "sync_failed" })
        .eq("id", accountId)
        .eq("user_id", userId);
      return { ok: false, code: "sync_failed", message: exErr.message };
    }

    if (existing?.id) {
      const { error: upErr } = await supabase
        .from("broker_trades")
        .update({
          symbol: payload.symbol,
          side: payload.side,
          volume: payload.volume,
          open_time: payload.open_time,
          close_time: payload.close_time,
          open_price: payload.open_price,
          close_price: payload.close_price,
          pnl: payload.pnl,
          fees: payload.fees,
          raw: payload.raw,
        })
        .eq("id", existing.id)
        .eq("user_id", userId);
      if (upErr) {
        await supabase.from("user_broker_accounts").update({ provider_status: "sync_failed" }).eq("id", accountId);
        return { ok: false, code: "sync_failed", message: upErr.message };
      }
    } else {
      const { error: inErr } = await supabase.from("broker_trades").insert(payload);
      if (inErr) {
        await supabase.from("user_broker_accounts").update({ provider_status: "sync_failed" }).eq("id", accountId);
        return { ok: false, code: "sync_failed", message: inErr.message };
      }
      if (payload.close_time) {
        const pnl = Number(payload.pnl ?? 0);
        const symbol = cleanDisplaySymbol(String(payload.symbol ?? ""));
        void recordProactiveFeedEvent(
          supabase,
          userId,
          `trade_close:${t.external_trade_id}`,
          `Trade closed: ${payload.symbol}`,
          `${payload.side} ${pnl >= 0 ? `+${pnl.toFixed(2)}` : pnl.toFixed(2)} — journal updated`,
          symbol ? chartDeepLink(symbol) : "/history",
        );
      }
    }
    dealsUpserted += 1;
  }

  let accSnap: { connectionStatus?: string; state?: string } = {};
  try {
    accSnap = await withActionBudget(
      "sync_final_status",
      provisioningGetAccount(extId),
      SYNC_FINAL_STATUS_TIMEOUT_MS,
    );
  } catch {
    /* ignore */
  }

  const provider_status = mapConnectionToProviderStatus(accSnap.connectionStatus, accSnap.state) || "connected";

  const positionSymbols = positions
    .map((p) => (p && typeof p === "object" ? String((p as Record<string, unknown>).symbol ?? "") : ""))
    .filter(Boolean);
  const symbolRuntime =
    brokerSymbols.length > 0
      ? buildBrokerSymbolRuntimeMetadata({
          existingMetadata: prevMeta,
          knownSymbols: [...brokerSymbols, ...positionSymbols],
          displaySymbols: [...CANONICAL_BROKER_SYMBOLS, ...positionSymbols.map(cleanDisplaySymbol).filter(Boolean)],
        })
      : null;
  const symbolResolutionReport =
    symbolRuntime && brokerSymbols.length > 0
      ? await probeBrokerSymbolReport({
          accountId: extId,
          region: accountRegion,
          report: symbolRuntime.symbol_resolution_report,
          timeframe: "1h",
          displays: [...CANONICAL_BROKER_SYMBOLS],
          timeoutMs: 1_800,
        }).catch(() => symbolRuntime.symbol_resolution_report)
      : null;

  const metadata = {
    ...prevMeta,
    accountSummary: {
      balance: info.balance,
      equity: info.equity,
      currency: info.currency,
      server: info.server,
      login: info.login,
      broker: info.broker,
    },
    openPositions: positions,
    dealsFetched,
    dealsUpserted,
    lastSyncAt: new Date().toISOString(),
    ...(symbolRuntime
      ? {
          ...symbolRuntime,
          ...(symbolResolutionReport ? { symbol_resolution_report: symbolResolutionReport } : {}),
        }
      : {}),
  };

  await supabase
    .from("user_broker_accounts")
    .update({
      connection_method: "cloud_mt5",
      external_connection_id: extId,
      status: "active",
      provider_status: provider_status === "unknown" ? "connected" : provider_status,
      last_sync_at: new Date().toISOString(),
      metadata: {
        ...metadata,
        ...(accountRegion ? { metaapiRegion: accountRegion } : {}),
        ...(relinked ? { relinkedMetaapiAccountAt: new Date().toISOString() } : {}),
      },
    })
    .eq("id", accountId)
    .eq("user_id", userId);

  if (opts.revalidate) {
    revalidatePath("/accounts");
    revalidatePath("/history");
    revalidatePath("/journal");
    revalidatePath("/chat");
  }

  if (dealsFetched === 0 && !opts.allowEmptyDeals) {
    return {
      ok: false,
      code: "sync_no_deals",
      message: userMessageForCode("sync_no_deals"),
    };
  }

  const shouldJournal = opts.autoJournal !== false;
  if (shouldJournal && dealsUpserted > 0) {
    autoJournalTrades(supabase, userId, accountId)
      .then((r) => {
        if (!r.ok) console.error("[mt5Sync] auto-journal failed:", r.error);
      })
      .catch((e) => console.error("[mt5Sync] auto-journal trigger failed:", e));
  }

  return { ok: true, data: { dealsFetched, dealsUpserted, tradesNormalized } };
}

/**
 * Lightweight MetaAPI symbol discovery — fetches broker symbol universe and
 * writes metadata.symbol_map without syncing deal history. Used by cron backfill
 * and auto-triggers after account connect / test.
 */
export async function refreshCloudAccountSymbolMap(
  supabase: SupabaseClient,
  userId: string,
  accountId: string,
  opts: RefreshCloudAccountSymbolMapOptions = {},
): Promise<SymbolMapRefreshResult> {
  if (!getMetaApiToken()) {
    return { ok: false, code: "provider_not_configured", message: userMessageForCode("provider_not_configured") };
  }

  const { data: row, error } = await supabase
    .from("user_broker_accounts")
    .select("id,external_connection_id,connection_method,metadata,user_id,mt5_login,mt5_server,provider_status")
    .eq("id", accountId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return { ok: false, code: "unknown", message: error.message };
  if (!row?.external_connection_id || row.connection_method !== "cloud_mt5") {
    return { ok: false, code: "validation", message: "Not a MetaApi cloud account." };
  }

  let extId = row.external_connection_id as string;
  const prevMeta = (row.metadata ?? {}) as Record<string, unknown>;
  let accountRegion =
    typeof prevMeta.metaapiRegion === "string" ? prevMeta.metaapiRegion : null;

  let brokerSymbols: string[] = [];
  let positions: unknown[] = [];
  let relinked = false;

  try {
    const mt5Login = normalizeLogin(row.mt5_login as string | null);
    const mt5Server = String(row.mt5_server ?? "").trim();
    let acc: MetaApiTradingAccount | null = null;
    try {
      acc = await withActionBudget(
        "symbol_map_read_account",
        provisioningGetAccount(extId),
        SYNC_FINAL_STATUS_TIMEOUT_MS,
      );
    } catch (e) {
      const mapped = mapMetaApiActionError(e);
      if (mapped.code !== "not_found") throw e;
    }
    if (!acc || !accountMatchesMt5(acc, mt5Login, mt5Server)) {
      const existing = await withActionBudget(
        "symbol_map_find_existing",
        findExistingMetaApiAccount(mt5Login, mt5Server),
        TEST_PROVISIONING_TIMEOUT_MS,
      );
      if (!existing) {
        throw new MetaApiRequestError(
          "not_found",
          "No matching MetaApi account found for MT5 login/server",
          404,
          null,
        );
      }
      extId = existing.id;
      acc = existing.account;
      relinked = true;
    }
    if (typeof acc.region === "string" && acc.region.length > 0) {
      accountRegion = acc.region;
    }

    try {
      brokerSymbols = await withActionBudget(
        "symbol_map_list_symbols",
        clientListSymbols(extId, accountRegion),
        SYMBOL_LIST_TIMEOUT_MS,
      );
    } catch {
      brokerSymbols = [];
    }

    if (brokerSymbols.length === 0) {
      return {
        ok: false,
        code: "sync_failed",
        message: "Broker symbol list unavailable — terminal may still be deploying.",
      };
    }

    try {
      positions = await withActionBudget(
        "symbol_map_positions",
        clientGetPositions(extId, false, accountRegion),
        SYNC_POSITIONS_TIMEOUT_MS,
      );
    } catch {
      positions = [];
    }
  } catch (e) {
    const m = mapMetaApiActionError(e);
    if (m.code === "unknown") {
      return { ok: false, code: "sync_failed", message: userMessageForCode("sync_failed") };
    }
    return m;
  }

  const positionSymbols = positions
    .map((p) => (p && typeof p === "object" ? String((p as Record<string, unknown>).symbol ?? "") : ""))
    .filter(Boolean);
  const symbolRuntime = buildBrokerSymbolRuntimeMetadata({
    existingMetadata: prevMeta,
    knownSymbols: [...brokerSymbols, ...positionSymbols],
    displaySymbols: [...CANONICAL_BROKER_SYMBOLS, ...positionSymbols.map(cleanDisplaySymbol).filter(Boolean)],
  });

  const shouldProbe = opts.probe !== false;
  const symbolResolutionReport = shouldProbe
    ? await probeBrokerSymbolReport({
        accountId: extId,
        region: accountRegion,
        report: symbolRuntime.symbol_resolution_report,
        timeframe: "1h",
        displays: [...CANONICAL_BROKER_SYMBOLS],
        timeoutMs: SYMBOL_PROBE_TIMEOUT_MS,
      }).catch(() => symbolRuntime.symbol_resolution_report)
    : symbolRuntime.symbol_resolution_report;

  const mappedCount = Object.keys(symbolRuntime.symbol_map).length;
  if (mappedCount === 0) {
    return {
      ok: false,
      code: "sync_failed",
      message: "No broker symbols could be mapped for this account.",
    };
  }

  const providerStatus = String(row.provider_status ?? "connected");

  await supabase
    .from("user_broker_accounts")
    .update({
      connection_method: "cloud_mt5",
      external_connection_id: extId,
      status: "active",
      provider_status: providerStatus === "syncing" ? "connected" : providerStatus,
      metadata: {
        ...prevMeta,
        ...symbolRuntime,
        symbol_resolution_report: symbolResolutionReport,
        lastSymbolMapRefreshAt: new Date().toISOString(),
        ...(accountRegion ? { metaapiRegion: accountRegion } : {}),
        ...(relinked ? { relinkedMetaapiAccountAt: new Date().toISOString() } : {}),
      },
    })
    .eq("id", accountId)
    .eq("user_id", userId);

  return {
    ok: true,
    data: { mappedCount, universeSize: brokerSymbols.length },
  };
}

export { metadataHasSymbolMap };
