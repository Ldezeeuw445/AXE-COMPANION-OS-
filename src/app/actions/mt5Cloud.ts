"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { autoJournalTrades } from "@/services/journalingService";
import { normalizeDealsToClosedTrades, type MetaApiDeal } from "@/lib/mt5/dealNormalization";
import {
  classifyMetaApiProvisioningError,
  userMessageForCode,
  type Mt5CloudErrorCode,
} from "@/lib/mt5/metaApiErrors";
import { getMetaApiToken } from "@/lib/mt5/metaApiEnv";
import {
  clientGetAccountInformation,
  clientGetHistoryDealsRange,
  clientListSymbols,
  clientGetPositions,
  defaultRegionForProvisioning,
  metaApiTradingAccountId,
  MetaApiRequestError,
  provisioningCreateMt5CloudAccount,
  provisioningDeployAccount,
  provisioningFindMt5CloudAccount,
  provisioningGetAccount,
  provisioningRedeployAccount,
  type MetaApiTradingAccount,
} from "@/lib/mt5/metaApiClient";
import { META_API_REGIONS, type MetaApiRegion } from "@/lib/mt5/metaApiRegions";
import {
  buildBrokerSymbolRuntimeMetadata,
  CANONICAL_BROKER_SYMBOLS,
  probeBrokerSymbolReport,
} from "@/lib/broker/brokerSymbolRuntime";
import { cleanDisplaySymbol } from "@/lib/broker/symbolResolution";

export type Mt5CloudResult<T = unknown> =
  | { ok: true; data?: T }
  | { ok: false; code: Mt5CloudErrorCode; message: string };

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function cloudPlaceholderLinkHash(): string {
  return sha256Hex(`cloud_mt5:${randomBytes(32).toString("hex")}`);
}

function maskLogin(login: string): string {
  const d = login.replace(/\D/g, "");
  if (d.length <= 2) return "••••";
  return `••••${d.slice(-4)}`;
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

/**
 * Whether MetaAPI reports the account as actually live (terminal deployed and
 * connected). Treat both DEPLOYED state and CONNECTED connection-status as
 * "ready" — depending on broker speed one of them flips first. Anything else
 * (UNDEPLOYED, DEPLOYING, DISCONNECTED, CREATED) means the user shouldn't see
 * a green "connected" badge yet.
 */
function isProvisionedAndReady(
  connectionStatus: string | undefined,
  state: string | undefined,
): boolean {
  const c = (connectionStatus ?? "").toUpperCase();
  const s = (state ?? "").toUpperCase();
  return c === "CONNECTED" || s === "DEPLOYED";
}

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

async function ensureMetaApiAccountDeployment(
  metaId: string,
  snapshot: MetaApiTradingAccount | null,
): Promise<void> {
  const state = (snapshot?.state ?? "").toUpperCase();
  const connectionStatus = (snapshot?.connectionStatus ?? "").toUpperCase();
  if (state === "UNDEPLOYED" || state === "CREATED") {
    await withActionBudget(
      "recovery_deploy_account",
      provisioningDeployAccount(metaId),
      RECOVERY_OPERATION_TIMEOUT_MS,
    );
    return;
  }
  if (connectionStatus !== "CONNECTED" || state !== "DEPLOYED") {
    await withActionBudget(
      "recovery_redeploy_account",
      provisioningRedeployAccount(metaId),
      RECOVERY_OPERATION_TIMEOUT_MS,
    );
  }
}

const PROVISIONING_POLL_INTERVAL_MS = 1_500;
const PROVISIONING_POLL_BUDGET_MS = 10_000;
const PROVISIONING_PROBE_STEP_TIMEOUT_MS = 4_000;
const TEST_PROVISIONING_TIMEOUT_MS = 20_000;
const TEST_ACCOUNT_INFO_TIMEOUT_MS = 35_000;
const SYNC_ACCOUNT_INFO_TIMEOUT_MS = 35_000;
const SYNC_POSITIONS_TIMEOUT_MS = 35_000;
const SYNC_HISTORY_TIMEOUT_MS = 75_000;
const SYNC_FINAL_STATUS_TIMEOUT_MS = 10_000;
const RECOVERY_OPERATION_TIMEOUT_MS = 70_000;
const RECOVERY_POLL_BUDGET_MS = 60_000;
const RECOVERY_POLL_INTERVAL_MS = 2_500;

class Mt5ActionTimeoutError extends Error {
  constructor(readonly operation: string) {
    super(`${operation}_timeout`);
    this.name = "Mt5ActionTimeoutError";
  }
}

async function withActionBudget<T>(
  operation: string,
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Mt5ActionTimeoutError(operation)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Poll MetaAPI provisioning until the account is actually deployed/connected
 * or the budget runs out. Keeps the user from seeing a fake "connected"
 * badge during the 30-90s gap between MetaAPI's 201 response and the broker
 * terminal actually being live. Returns the final snapshot regardless — the
 * caller decides whether to insert with `provisioning` or `connected`.
 */
async function pollUntilDeployed(metaId: string): Promise<{
  connectionStatus?: string;
  state?: string;
  ready: boolean;
}> {
  const deadline = Date.now() + PROVISIONING_POLL_BUDGET_MS;
  let last: { connectionStatus?: string; state?: string } = {};

  while (Date.now() < deadline) {
    try {
      const acc = await withActionBudget(
        "provisioning_probe",
        provisioningGetAccount(metaId),
        PROVISIONING_PROBE_STEP_TIMEOUT_MS,
      );
      last = { connectionStatus: acc.connectionStatus, state: acc.state };
      if (isProvisionedAndReady(acc.connectionStatus, acc.state)) {
        return { ...last, ready: true };
      }
    } catch {
      // Transient probe failures are normal during the first few seconds.
      // Keep polling until the budget runs out.
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(PROVISIONING_POLL_INTERVAL_MS, remaining)),
    );
  }

  return { ...last, ready: false };
}

async function pollRecoveryUntilReady(metaId: string): Promise<{
  connectionStatus?: string;
  state?: string;
  ready: boolean;
}> {
  const deadline = Date.now() + RECOVERY_POLL_BUDGET_MS;
  let last: { connectionStatus?: string; state?: string } = {};

  while (Date.now() < deadline) {
    const acc = await withActionBudget(
      "recovery_probe",
      provisioningGetAccount(metaId),
      PROVISIONING_PROBE_STEP_TIMEOUT_MS,
    );
    last = { connectionStatus: acc.connectionStatus, state: acc.state };
    if (isProvisionedAndReady(acc.connectionStatus, acc.state)) {
      return { ...last, ready: true };
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(RECOVERY_POLL_INTERVAL_MS, remaining)),
    );
  }

  return { ...last, ready: false };
}

export async function createCloudMt5ConnectionAction(
  _prev: Mt5CloudResult<{ accountId: string }> | undefined,
  formData: FormData,
): Promise<Mt5CloudResult<{ accountId: string }>> {
  if (!getMetaApiToken()) {
    return { ok: false, code: "provider_not_configured", message: userMessageForCode("provider_not_configured") };
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) return { ok: false, code: "unknown", message: "Supabase is not configured." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "validation", message: "Not signed in." };

  const label = String(formData.get("label") ?? "").trim();
  const mt5Login = String(formData.get("mt5Login") ?? "").trim().replace(/\D/g, "");
  const mt5Server = String(formData.get("mt5Server") ?? "").trim();
  const investorPassword = String(formData.get("investorPassword") ?? "");
  const readOnlyOk = formData.get("readOnlyConfirm") === "on" || formData.get("readOnlyConfirm") === "true";

  if (!label) return { ok: false, code: "validation", message: "Label is required." };
  if (!mt5Login) return { ok: false, code: "validation", message: "MT5 login (digits) is required." };
  if (!mt5Server) return { ok: false, code: "validation", message: "MT5 server name is required." };
  if (!investorPassword) return { ok: false, code: "validation", message: "Investor (read-only) password is required." };
  if (!readOnlyOk) {
    return {
      ok: false,
      code: "validation",
      message: "Confirm read-only access: tick the checkbox to use investor password only.",
    };
  }

  // Region must be one of the supported MetaApi clouds. The form already
  // restricts the select to these three; this is a belt-and-braces check so
  // a tampered request can't push the account into an unsupported region.
  const rawRegion = String(formData.get("region") ?? "").trim();
  const region: MetaApiRegion = (META_API_REGIONS as readonly string[]).includes(rawRegion)
    ? (rawRegion as MetaApiRegion)
    : (defaultRegionForProvisioning() as MetaApiRegion);

  let metaId: string;
  let existingMetaAccount: MetaApiTradingAccount | null = null;
  try {
    const existing = await withActionBudget(
      "find_existing_metaapi_account",
      findExistingMetaApiAccount(mt5Login, mt5Server),
      TEST_PROVISIONING_TIMEOUT_MS,
    );
    if (existing) {
      metaId = existing.id;
      existingMetaAccount = existing.account;
      await ensureMetaApiAccountDeployment(metaId, existingMetaAccount);
    } else {
      const created = await provisioningCreateMt5CloudAccount({
        login: mt5Login,
        password: investorPassword,
        name: label,
        server: mt5Server,
        region,
        manualTrades: true,
      });
      metaId = created.id;
    }
  } catch (e) {
    return mapMetaError(e);
  }

  // Block briefly so the user doesn't see a green "connected" badge before
  // the broker terminal is actually live. Most MetaAPI cloud accounts hit
  // DEPLOYED within 5-10s; if they don't we still create the row (so the
  // user can see it in /accounts) but with `provisioning` status, and the
  // UI / Test action takes over polling from there.
  const probe = await pollUntilDeployed(metaId);
  const providerStatus = probe.ready
    ? mapConnectionToProviderStatus(probe.connectionStatus, probe.state)
    : "provisioning";

  const masked_login = maskLogin(mt5Login);
  const metadata = {
    metaapiRegion:
      (typeof existingMetaAccount?.region === "string" && existingMetaAccount.region.length > 0
        ? existingMetaAccount.region
        : region),
    readOnlyConfirmed: true,
    createdVia: "axe_companion_cloud_mt5",
    metaapiAccountReused: existingMetaAccount != null,
    provisionedReady: probe.ready,
    provisioningProbedAt: new Date().toISOString(),
  };

  const { data: existingLocalRow, error: existingLocalErr } = await supabase
    .from("user_broker_accounts")
    .select("id,metadata")
    .eq("user_id", user.id)
    .eq("provider", "mt5")
    .eq("mt5_login", mt5Login)
    .eq("mt5_server", mt5Server)
    .maybeSingle();

  if (existingLocalErr) {
    return { ok: false, code: "unknown", message: existingLocalErr.message };
  }

  if (existingLocalRow?.id) {
    const previousMeta =
      existingLocalRow.metadata && typeof existingLocalRow.metadata === "object" && !Array.isArray(existingLocalRow.metadata)
        ? (existingLocalRow.metadata as Record<string, unknown>)
        : {};
    const { error: updateExistingErr } = await supabase
      .from("user_broker_accounts")
      .update({
        label,
        status: "active",
        connection_method: "cloud_mt5",
        external_connection_id: metaId,
        provider_status: providerStatus,
        masked_login,
        metadata: {
          ...previousMeta,
          ...metadata,
          recoveredFromLocalDuplicate: true,
        },
      })
      .eq("id", existingLocalRow.id as string)
      .eq("user_id", user.id);

    if (updateExistingErr) return { ok: false, code: "unknown", message: updateExistingErr.message };

    revalidatePath("/accounts");
    revalidatePath("/history");
    revalidatePath("/journal");
    revalidatePath("/chat");

    return { ok: true, data: { accountId: existingLocalRow.id as string } };
  }

  const { data: inserted, error } = await supabase
    .from("user_broker_accounts")
    .insert({
      user_id: user.id,
      provider: "mt5",
      label,
      status: "active",
      mt5_login: mt5Login,
      mt5_server: mt5Server,
      link_token_hash: cloudPlaceholderLinkHash(),
      connection_method: "cloud_mt5",
      external_connection_id: metaId,
      provider_status: providerStatus,
      masked_login,
      metadata,
    })
    .select("id")
    .single();

  if (error) {
    return { ok: false, code: "unknown", message: error.message };
  }

  revalidatePath("/accounts");
  revalidatePath("/history");
  revalidatePath("/journal");
  revalidatePath("/chat");

  return { ok: true, data: { accountId: inserted.id as string } };
}

/**
 * Lightweight status poll used by the Accounts page auto-poll while an
 * account is provisioning. Only calls `provisioningGetAccount` (cheap,
 * ~1-2s) so we can refresh the UI every 5s without burning MetaApi
 * resource slots or hammering the broker terminal with full
 * `account-information` calls. Returns the latest status so the client
 * can stop polling once it flips to `connected`.
 *
 * NOTE: This is fire-and-forget from the UI's perspective — failures are
 * swallowed (no toast spam during transient probe errors).
 */
export async function probeCloudMt5StatusAction(accountId: string): Promise<
  Mt5CloudResult<{ providerStatus: string }>
> {
  if (!getMetaApiToken()) {
    return { ok: false, code: "provider_not_configured", message: userMessageForCode("provider_not_configured") };
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) return { ok: false, code: "unknown", message: "Supabase is not configured." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "validation", message: "Not signed in." };

  const { data: row, error } = await supabase
    .from("user_broker_accounts")
    .select("id,external_connection_id,connection_method,provider_status,metadata,user_id")
    .eq("id", accountId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return { ok: false, code: "unknown", message: error.message };
  if (!row?.external_connection_id || row.connection_method !== "cloud_mt5") {
    return { ok: false, code: "validation", message: "Not a MetaApi cloud account." };
  }

  const extId = row.external_connection_id as string;
  let providerStatus = (row.provider_status as string | null) ?? "unknown";
  const currentMeta =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};
  const hasRegion = typeof currentMeta.metaapiRegion === "string" && currentMeta.metaapiRegion.length > 0;

  let acc: { connectionStatus?: string; state?: string; region?: string } | null = null;
  try {
    acc = await withActionBudget(
      "auto_provisioning_probe",
      provisioningGetAccount(extId),
      PROVISIONING_PROBE_STEP_TIMEOUT_MS,
    );
    providerStatus = mapConnectionToProviderStatus(acc.connectionStatus, acc.state);
  } catch {
    // Transient probe failures are common during the first 60s after
    // create — keep the previous status and let the next tick try again.
    return { ok: true, data: { providerStatus } };
  }

  // Two reasons to write back here:
  //  1. status flipped (provisioning → connected etc.) — UI needs it.
  //  2. metadata.metaapiRegion is missing (legacy accounts created before
  //     the region-aware migration). MetaApi's provisioningGetAccount
  //     returns the deployed region, so we can backfill it without an
  //     extra round-trip. After this poll the account routes to the
  //     correct host on the very next chart / positions / order call.
  const newRegion = typeof acc.region === "string" && acc.region.length > 0 ? acc.region : null;
  const shouldBackfillRegion = !hasRegion && newRegion != null;
  const statusChanged = providerStatus !== row.provider_status;

  if (statusChanged || shouldBackfillRegion) {
    const patch: Record<string, unknown> = {};
    if (statusChanged) patch.provider_status = providerStatus;
    if (shouldBackfillRegion) {
      patch.metadata = { ...currentMeta, metaapiRegion: newRegion };
    }
    await supabase
      .from("user_broker_accounts")
      .update(patch)
      .eq("id", accountId)
      .eq("user_id", user.id);
  }

  return { ok: true, data: { providerStatus } };
}

export async function testCloudMt5ConnectionAction(accountId: string): Promise<Mt5CloudResult> {
  if (!getMetaApiToken()) {
    return { ok: false, code: "provider_not_configured", message: userMessageForCode("provider_not_configured") };
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) return { ok: false, code: "unknown", message: "Supabase is not configured." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "validation", message: "Not signed in." };

  const { data: row, error } = await supabase
    .from("user_broker_accounts")
    .select("id,external_connection_id,connection_method,user_id,metadata,mt5_login,mt5_server")
    .eq("id", accountId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return { ok: false, code: "unknown", message: error.message };
  if (!row?.external_connection_id || row.connection_method !== "cloud_mt5") {
    return { ok: false, code: "validation", message: "Not a MetaApi cloud account." };
  }

  let extId = row.external_connection_id as string;
  const prevMetaRow =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};
  const accountRegion =
    typeof prevMetaRow.metaapiRegion === "string" ? prevMetaRow.metaapiRegion : null;

  try {
    const mt5Login = normalizeLogin(row.mt5_login as string | null);
    const mt5Server = String(row.mt5_server ?? "").trim();
    let acc: MetaApiTradingAccount | null = null;
    let relinked = false;

    try {
      acc = await withActionBudget(
        "test_provisioning",
        provisioningGetAccount(extId),
        TEST_PROVISIONING_TIMEOUT_MS,
      );
    } catch (e) {
      const mapped = mapMetaError(e);
      if (mapped.code !== "not_found") throw e;
    }

    if (!acc || !accountMatchesMt5(acc, mt5Login, mt5Server)) {
      const existing = await withActionBudget(
        "find_existing_metaapi_account",
        findExistingMetaApiAccount(mt5Login, mt5Server),
        TEST_PROVISIONING_TIMEOUT_MS,
      );
      if (!existing) {
        throw new MetaApiRequestError("not_found", "No matching MetaApi account found for MT5 login/server", 404, null);
      }
      extId = existing.id;
      acc = existing.account;
      relinked = true;
    }

    // Backfill the region for legacy accounts that were created before
    // the region-aware migration. provisioningGetAccount returns the
    // deployed region "for free" so we just persist it here — the next
    // chart / positions / order call will then route to the correct host
    // instead of falling back to env-default london.
    const resolvedRegion =
      accountRegion ??
      (typeof acc.region === "string" && acc.region.length > 0 ? acc.region : null);
    const info = await withActionBudget(
      "test_account_information",
      clientGetAccountInformation(extId, true, resolvedRegion),
      TEST_ACCOUNT_INFO_TIMEOUT_MS,
    );
    const provider_status = mapConnectionToProviderStatus(acc.connectionStatus, acc.state);

    const meta = {
      ...prevMetaRow,
      ...(resolvedRegion && !accountRegion ? { metaapiRegion: resolvedRegion } : {}),
      ...(relinked ? { relinkedMetaapiAccountAt: new Date().toISOString() } : {}),
      accountSummary: {
        balance: info.balance,
        equity: info.equity,
        currency: info.currency,
        server: info.server,
        login: info.login,
        broker: info.broker,
      },
      lastTerminalProbeAt: new Date().toISOString(),
    };

    await supabase
      .from("user_broker_accounts")
      .update({
        connection_method: "cloud_mt5",
        external_connection_id: extId,
        status: "active",
        provider_status,
        metadata: meta,
      })
      .eq("id", accountId)
      .eq("user_id", user.id);
  } catch (e) {
    const mapped = mapMetaError(e);
    const failStatus = mapped.code === "mt5_invalid_credentials" ? "invalid_credentials" : "failed";
    await supabase
      .from("user_broker_accounts")
      .update({ provider_status: failStatus })
      .eq("id", accountId)
      .eq("user_id", user.id);
    return mapped;
  }

  revalidatePath("/accounts");
  return { ok: true };
}

export async function syncCloudMt5AccountAction(accountId: string): Promise<
  Mt5CloudResult<{
    dealsFetched: number;
    dealsUpserted: number;
    tradesNormalized: number;
  }>
> {
  if (!getMetaApiToken()) {
    return { ok: false, code: "provider_not_configured", message: userMessageForCode("provider_not_configured") };
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) return { ok: false, code: "unknown", message: "Supabase is not configured." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "validation", message: "Not signed in." };

  const { data: row, error } = await supabase
    .from("user_broker_accounts")
    .select("id,external_connection_id,connection_method,metadata,user_id,mt5_login,mt5_server")
    .eq("id", accountId)
    .eq("user_id", user.id)
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
    .eq("user_id", user.id);

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
      const mapped = mapMetaError(e);
      if (mapped.code !== "not_found") throw e;
    }
    if (!acc || !accountMatchesMt5(acc, mt5Login, mt5Server)) {
      const existing = await withActionBudget(
        "find_existing_metaapi_account",
        findExistingMetaApiAccount(mt5Login, mt5Server),
        TEST_PROVISIONING_TIMEOUT_MS,
      );
      if (!existing) {
        throw new MetaApiRequestError("not_found", "No matching MetaApi account found for MT5 login/server", 404, null);
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
      clientGetHistoryDealsRange(
        extId,
        start.toISOString(),
        end.toISOString(),
        accountRegion,
      ),
      SYNC_HISTORY_TIMEOUT_MS,
    );
  } catch (e) {
    await supabase
      .from("user_broker_accounts")
      .update({ provider_status: "sync_failed", metadata: { ...prevMeta, lastSyncErrorAt: new Date().toISOString() } })
      .eq("id", accountId)
      .eq("user_id", user.id);
    const m = mapMetaError(e);
    if (m.code === "unknown") return { ok: false, code: "sync_failed", message: userMessageForCode("sync_failed") };
    return m;
  }

  const dealsFetched = dealsRaw.length;
  const normalized = normalizeDealsToClosedTrades(dealsRaw as MetaApiDeal[]);
  const tradesNormalized = normalized.length;

  let dealsUpserted = 0;
  for (const t of normalized) {
    const payload = {
      user_id: user.id,
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
        .eq("user_id", user.id);
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
        .eq("user_id", user.id);
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
    .eq("user_id", user.id);

  revalidatePath("/accounts");
  revalidatePath("/history");
  revalidatePath("/journal");
  revalidatePath("/chat");

  if (dealsFetched === 0) {
    return {
      ok: false,
      code: "sync_no_deals",
      message: userMessageForCode("sync_no_deals"),
    };
  }

  // Fire-and-forget: auto-journal new trades with AXE alignment scoring.
  // Runs IN-PROCESS with the authenticated client + user id. (Previously this
  // POSTed to /api/axe-journal without auth cookies, which always returned 401
  // and silently dropped every auto-journal.)
  if (dealsUpserted > 0) {
    autoJournalTrades(supabase, user.id, accountId)
      .then((r) => {
        if (!r.ok) console.error("[mt5Cloud] auto-journal failed:", r.error);
      })
      .catch((e) => console.error("[mt5Cloud] auto-journal trigger failed:", e));
  }

  return { ok: true, data: { dealsFetched, dealsUpserted, tradesNormalized } };
}

export async function disconnectCloudMt5AccountAction(accountId: string): Promise<Mt5CloudResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { ok: false, code: "unknown", message: "Supabase is not configured." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "validation", message: "Not signed in." };

  const { data: row, error } = await supabase
    .from("user_broker_accounts")
    .select("id,external_connection_id,connection_method,metadata,user_id")
    .eq("id", accountId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return { ok: false, code: "unknown", message: error.message };
  if (!row || row.connection_method !== "cloud_mt5") {
    return { ok: false, code: "validation", message: "Not a MetaApi cloud account." };
  }

  const prevId = row.external_connection_id as string | null;
  const prevMetaDisc =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};
  const meta = {
    ...prevMetaDisc,
    previousMetaapiAccountId: prevId,
    disconnectedAt: new Date().toISOString(),
    metaapiAccountPreserved: true,
  };

  const { error: upErr } = await supabase
    .from("user_broker_accounts")
    .update({
      connection_method: "cloud_mt5_disconnected",
      external_connection_id: null,
      provider_status: "disconnected",
      status: "inactive",
      metadata: meta,
    })
    .eq("id", accountId)
    .eq("user_id", user.id);

  if (upErr) return { ok: false, code: "unknown", message: upErr.message };

  revalidatePath("/accounts");
  revalidatePath("/history");
  revalidatePath("/journal");
  revalidatePath("/chat");

  return { ok: true };
}

export async function recoverCloudMt5AccountAction(accountId: string): Promise<Mt5CloudResult> {
  if (!getMetaApiToken()) {
    return { ok: false, code: "provider_not_configured", message: userMessageForCode("provider_not_configured") };
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) return { ok: false, code: "unknown", message: "Supabase is not configured." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "validation", message: "Not signed in." };

  const { data: row, error } = await supabase
    .from("user_broker_accounts")
    .select("id,external_connection_id,connection_method,provider_status,metadata,user_id,mt5_login,mt5_server")
    .eq("id", accountId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return { ok: false, code: "unknown", message: error.message };
  if (!row || (row.connection_method !== "cloud_mt5" && row.connection_method !== "cloud_mt5_disconnected")) {
    return {
      ok: false,
      code: "validation",
      message: "Not a MetaApi cloud account.",
    };
  }

  let extId = row.external_connection_id as string | null;
  const prevMeta =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};
  const recoveryStartedAt = new Date().toISOString();

  await supabase
    .from("user_broker_accounts")
    .update({
      provider_status: "recovering",
      metadata: {
        ...prevMeta,
        lastRecovery: {
          status: "started",
          startedAt: recoveryStartedAt,
        },
      },
    })
    .eq("id", accountId)
    .eq("user_id", user.id);

  try {
    const mt5Login = normalizeLogin(row.mt5_login as string | null);
    const mt5Server = String(row.mt5_server ?? "").trim();
    let live: MetaApiTradingAccount | null = null;
    let relinked = false;

    if (extId) {
      try {
        live = await withActionBudget(
          "recovery_read_account",
          provisioningGetAccount(extId),
          TEST_PROVISIONING_TIMEOUT_MS,
        );
      } catch (e) {
        const mapped = mapMetaError(e);
        if (mapped.code !== "not_found") throw e;
      }
    }

    if (!live || !accountMatchesMt5(live, mt5Login, mt5Server)) {
      if (!mt5Login || !mt5Server) {
        throw new MetaApiRequestError(
          "validation",
          "Missing MT5 login/server for MetaApi account recovery",
          0,
          null,
        );
      }
      const existing = await withActionBudget(
        "find_existing_metaapi_account",
        findExistingMetaApiAccount(mt5Login, mt5Server),
        TEST_PROVISIONING_TIMEOUT_MS,
      );
      if (!existing) {
        throw new MetaApiRequestError("not_found", "No matching MetaApi account found for MT5 login/server", 404, null);
      }
      extId = existing.id;
      live = existing.account;
      relinked = true;
    }

    if (!extId) {
      throw new MetaApiRequestError("not_found", "No MetaApi account id found for recovery", 404, null);
    }

    await ensureMetaApiAccountDeployment(extId, live);

    const final = await pollRecoveryUntilReady(extId);
    const providerStatus = final.ready
      ? mapConnectionToProviderStatus(final.connectionStatus, final.state)
      : mapConnectionToProviderStatus(final.connectionStatus, final.state) || "recovering";
    const resolvedRegion =
      typeof live.region === "string" && live.region.length > 0
        ? live.region
        : typeof prevMeta.metaapiRegion === "string"
          ? prevMeta.metaapiRegion
          : null;

    await supabase
      .from("user_broker_accounts")
      .update({
        connection_method: "cloud_mt5",
        external_connection_id: extId,
        status: "active",
        provider_status: final.ready ? providerStatus : "recovery_failed",
        metadata: {
          ...prevMeta,
          ...(resolvedRegion ? { metaapiRegion: resolvedRegion } : {}),
          lastRecovery: {
            status: final.ready ? "ready" : "pending",
            startedAt: recoveryStartedAt,
            finishedAt: new Date().toISOString(),
            state: final.state ?? null,
            connectionStatus: final.connectionStatus ?? null,
            relinkedMetaapiAccount: relinked,
          },
        },
      })
      .eq("id", accountId)
      .eq("user_id", user.id);

    revalidatePath("/accounts");
    revalidatePath("/chart");
    revalidatePath("/positions");
    revalidatePath("/history");
    revalidatePath("/journal");
    revalidatePath("/chat");

    if (!final.ready) {
      return {
        ok: false,
        code: "sync_failed",
        message: "MetaApi accepted the recovery request, but the broker terminal is still not connected. Retry in a minute.",
      };
    }

    return { ok: true };
  } catch (e) {
    const mapped = mapMetaError(e);
    const orphanPatch =
      mapped.code === "not_found"
        ? {
            connection_method: "cloud_mt5_disconnected",
            external_connection_id: null,
            provider_status: "orphaned",
            status: "inactive",
            metadata: {
              ...prevMeta,
              orphanedMetaapiAccountId: extId,
              lastRecovery: {
                status: "orphaned",
                startedAt: recoveryStartedAt,
                finishedAt: new Date().toISOString(),
                reason: mapped.code,
              },
            },
          }
        : {
            provider_status: "recovery_failed",
            metadata: {
              ...prevMeta,
              lastRecovery: {
                status: "failed",
                startedAt: recoveryStartedAt,
                finishedAt: new Date().toISOString(),
                reason: mapped.code,
              },
            },
          };

    await supabase
      .from("user_broker_accounts")
      .update(orphanPatch)
      .eq("id", accountId)
      .eq("user_id", user.id);

    revalidatePath("/accounts");
    revalidatePath("/chart");
    revalidatePath("/positions");
    revalidatePath("/history");
    revalidatePath("/journal");
    revalidatePath("/chat");
    return mapped;
  }
}

function mapMetaError(e: unknown): { ok: false; code: Mt5CloudErrorCode; message: string } {
  if (e instanceof Mt5ActionTimeoutError) {
    return { ok: false, code: "metaapi_timeout", message: userMessageForCode("metaapi_timeout") };
  }
  if (e instanceof MetaApiRequestError) {
    const code = e.code;
    if (code === "unknown" && e.payload) {
      const alt = classifyMetaApiProvisioningError(e.payload);
      if (alt !== "unknown") {
        return { ok: false, code: alt, message: userMessageForCode(alt) };
      }
    }
    return { ok: false, code, message: userMessageForCode(code) };
  }
  if (e instanceof Error && e.name === "AbortError") {
    return { ok: false, code: "metaapi_timeout", message: userMessageForCode("metaapi_timeout") };
  }
  return { ok: false, code: "unknown", message: userMessageForCode("unknown") };
}
