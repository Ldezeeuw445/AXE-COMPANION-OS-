"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  classifyMetaApiProvisioningError,
  userMessageForCode,
  type Mt5CloudErrorCode,
} from "@/lib/mt5/metaApiErrors";
import { getMetaApiToken } from "@/lib/mt5/metaApiEnv";
import {
  clientGetAccountInformation,
  clientListSymbols,
  clientGetPositions,
  clientGetSymbolPrice,
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
import { metadataHasSymbolMap, refreshCloudAccountSymbolMap, runCloudMt5Sync } from "@/lib/mt5/syncCloudAccount";
import { syncBrokerHubFromAccountRow } from "@/lib/broker/hub/sync";
import {
  metaApiComplianceConfirmed,
  META_API_COMPLIANCE_ERROR,
} from "@/lib/legal/metaApiCompliance";

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

function triggerSymbolMapRefreshIfNeeded(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string,
  accountId: string,
  metadata: Record<string, unknown> | null | undefined,
): void {
  if (!supabase || metadataHasSymbolMap(metadata)) return;
  void refreshCloudAccountSymbolMap(supabase, userId, accountId, { probe: false }).catch((e) =>
    console.error("[mt5Cloud] symbol map refresh failed:", e),
  );
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
  const passwordTypeRaw = String(formData.get("passwordType") ?? "investor").trim();
  const passwordType = passwordTypeRaw === "master" ? "master" : "investor";
  const mt5Password =
    String(formData.get("mt5Password") ?? "").trim() ||
    String(formData.get("investorPassword") ?? "");
  if (!metaApiComplianceConfirmed(formData)) {
    return { ok: false, code: "validation", message: META_API_COMPLIANCE_ERROR };
  }

  if (!label) return { ok: false, code: "validation", message: "Label is required." };
  if (!mt5Login) return { ok: false, code: "validation", message: "MT5 login (digits) is required." };
  if (!mt5Server) return { ok: false, code: "validation", message: "MT5 server name is required." };
  if (!mt5Password) {
    return {
      ok: false,
      code: "validation",
      message: passwordType === "master" ? "Master password is required." : "Investor (read-only) password is required.",
    };
  }
  const manualTrades = passwordType === "investor";

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
        password: mt5Password,
        name: label,
        server: mt5Server,
        region,
        manualTrades,
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
    passwordType,
    metaApiComplianceConfirmed: true,
    passwordType,
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

    if (probe.ready) {
      triggerSymbolMapRefreshIfNeeded(supabase, user.id, existingLocalRow.id as string, {
        ...previousMeta,
        ...metadata,
      });
    }

    revalidatePath("/accounts");
    revalidatePath("/history");
    revalidatePath("/journal");
    revalidatePath("/chat");

    void syncBrokerHubFromAccountRow(supabase, existingLocalRow.id as string).catch(() => undefined);

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

  if (probe.ready) {
    triggerSymbolMapRefreshIfNeeded(supabase, user.id, inserted.id as string, metadata);
  }

  revalidatePath("/accounts");
  revalidatePath("/history");
  revalidatePath("/journal");
  revalidatePath("/chat");

  void syncBrokerHubFromAccountRow(supabase, inserted.id as string).catch(() => undefined);

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

    void syncBrokerHubFromAccountRow(supabase, accountId).catch(() => undefined);
  }

  if (providerStatus === "connected") {
    triggerSymbolMapRefreshIfNeeded(supabase, user.id, accountId, currentMeta);
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

    triggerSymbolMapRefreshIfNeeded(supabase, user.id, accountId, meta);
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
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { ok: false, code: "unknown", message: "Supabase is not configured." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "validation", message: "Not signed in." };

  return runCloudMt5Sync(supabase, user.id, accountId, {
    revalidate: true,
    autoJournal: true,
    allowEmptyDeals: false,
  });
}

export async function runCloudMt5DoctorAction(accountId: string): Promise<Mt5CloudResult<Mt5DoctorReport>> {
  const checkedAt = new Date().toISOString();
  if (!getMetaApiToken()) {
    return { ok: false, code: "provider_not_configured", message: userMessageForCode("provider_not_configured") };
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) return { ok: false, code: "unknown", message: "Supabase is not configured." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "validation", message: "Not signed in." };

  const [{ data: row, error }, prefsRes, chartRes] = await Promise.all([
    supabase
      .from("user_broker_accounts")
      .select("id,label,external_connection_id,connection_method,provider_status,last_sync_at,masked_login,mt5_login,mt5_server,metadata,user_id")
      .eq("id", accountId)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("user_workspace_preferences")
      .select("live_trading_enabled")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("chart_live_snapshots")
      .select("broker_symbol,display_symbol,updated_at")
      .eq("user_id", user.id)
      .eq("account_id", accountId)
      .order("updated_at", { ascending: false })
      .limit(1),
  ]);

  if (error) return { ok: false, code: "unknown", message: error.message };
  if (!row?.external_connection_id || row.connection_method !== "cloud_mt5") {
    return { ok: false, code: "validation", message: "Not a MetaApi cloud account." };
  }

  const extId = row.external_connection_id as string;
  const prevMeta =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};
  const accountRegion = safeString(prevMeta.metaapiRegion);
  const liveTradingEnabled = Boolean(prefsRes.data?.live_trading_enabled);
  const lastSyncAt = (row.last_sync_at as string | null | undefined) ?? null;
  const lastSyncAgeMinutes = minutesSince(lastSyncAt);
  const providerStatus = (row.provider_status as string | null | undefined) ?? null;
  const knownFailure = knownFailureFromStatus(providerStatus);
  const steps: Mt5DoctorStep[] = [];

  let deploymentState: string | null = null;
  let terminalStatus: string | null = null;
  let brokerServer = (row.mt5_server as string | null | undefined) ?? null;
  let brokerName: string | null = null;
  let loginMasked =
    (row.masked_login as string | null | undefined) ??
    (row.mt5_login != null ? maskLogin(String(row.mt5_login)) : null);
  let positionsCount: number | null = null;
  let historyDealsChecked: number | null = null;
  let priceSymbolChecked: string | null = null;
  let resolvedRegion = accountRegion;

  let provisioningStepStatus: Mt5DoctorStepStatus = "unknown";
  let terminalStepStatus: Mt5DoctorStepStatus = "unknown";
  let brokerStepStatus: Mt5DoctorStepStatus = "unknown";
  let positionsStepStatus: Mt5DoctorStepStatus = "unknown";
  let historyStepStatus: Mt5DoctorStepStatus = "unknown";
  let priceStepStatus: Mt5DoctorStepStatus = "skipped";
  let credentialsStatus: Mt5DoctorStepStatus = "unknown";
  let serverStatus: Mt5DoctorStepStatus = brokerServer ? "warn" : "unknown";
  let activeSymbols: string[] = [];
  let provisioningError: string | null = null;

  try {
    const acc = await withActionBudget(
      "doctor_provisioning",
      provisioningGetAccount(extId),
      DOCTOR_PROVISIONING_TIMEOUT_MS,
    );
    deploymentState = safeString(acc.state);
    terminalStatus = safeString(acc.connectionStatus);
    brokerServer = safeString(acc.server) ?? brokerServer;
    if (!loginMasked && acc.login) loginMasked = maskLogin(String(acc.login));
    if (!resolvedRegion && acc.region) resolvedRegion = acc.region;
    provisioningStepStatus = "pass";
    const provider_status = mapConnectionToProviderStatus(acc.connectionStatus, acc.state);
    terminalStepStatus = (acc.connectionStatus ?? "").toUpperCase() === "CONNECTED" ? "pass" : "warn";
    steps.push(doctorStep("metaapi_account_exists", "MetaAPI account exists", "pass", "MetaAPI returned this account."));
    steps.push(
      doctorStep(
        "deployment_state",
        "MetaAPI deployment state",
        isProvisionedAndReady(acc.connectionStatus, acc.state) ? "pass" : "warn",
        `State ${acc.state ?? "unknown"} · terminal ${acc.connectionStatus ?? "unknown"}.`,
      ),
    );
    await supabase
      .from("user_broker_accounts")
      .update({
        provider_status,
        metadata: { ...prevMeta, ...(resolvedRegion ? { metaapiRegion: resolvedRegion } : {}) },
      })
      .eq("id", accountId)
      .eq("user_id", user.id);
  } catch (e) {
    provisioningError = compactMetaError(e);
    provisioningStepStatus = "fail";
    terminalStepStatus = "fail";
    steps.push(doctorStep("metaapi_account_exists", "MetaAPI account exists", "fail", provisioningError));
    steps.push(doctorStep("deployment_state", "MetaAPI deployment state", "fail", provisioningError));
  }

  let accountInfo: Record<string, unknown> | null = null;
  let accountInfoError: string | null = null;
  if (provisioningStepStatus === "pass") {
    try {
      accountInfo = await withActionBudget(
        "doctor_account_information",
        clientGetAccountInformation(extId, true, resolvedRegion),
        DOCTOR_ACCOUNT_INFO_TIMEOUT_MS,
      );
      credentialsStatus = "pass";
      serverStatus = "pass";
      brokerStepStatus = "pass";
      brokerServer = safeString(accountInfo.server) ?? brokerServer;
      brokerName = safeString(accountInfo.broker);
      if (!loginMasked && accountInfo.login) loginMasked = maskLogin(String(accountInfo.login));
    } catch (e) {
      accountInfoError = compactMetaError(e);
      const mapped = mapMetaError(e);
      credentialsStatus = mapped.code === "mt5_invalid_credentials" ? "fail" : "unknown";
      serverStatus = mapped.code === "metaapi_region_error" || mapped.code === "not_found" ? "fail" : serverStatus;
      brokerStepStatus = "fail";
    }
  }

  steps.unshift(
    doctorStep(
      "server_detected",
      "Broker server detected",
      serverStatus,
      brokerServer ? `Server ${brokerServer}.` : "No broker server was returned by MetaAPI.",
    ),
  );
  steps.unshift(
    doctorStep(
      "credentials_accepted",
      "Credentials accepted",
      credentialsStatus,
      credentialsStatus === "pass"
        ? "MetaAPI account-information accepted the linked MT5 credentials."
        : accountInfoError ?? provisioningError ?? "Could not confirm credentials without account information.",
    ),
  );
  steps.push(
    doctorStep(
      "terminal_connected",
      "Terminal connected",
      terminalStepStatus,
      terminalStatus ? `Terminal status ${terminalStatus}.` : "Terminal status unavailable.",
    ),
  );
  steps.push(
    doctorStep(
      "broker_connected",
      "Broker data reachable",
      brokerStepStatus,
      brokerStepStatus === "pass"
        ? `${brokerName ? `${brokerName} · ` : ""}${brokerServer ?? "server confirmed"}.`
        : accountInfoError ?? "Account information could not be read.",
    ),
  );

  let positions: Record<string, unknown>[] = [];
  if (brokerStepStatus === "pass") {
    try {
      positions = (await withActionBudget(
        "doctor_positions",
        clientGetPositions(extId, false, resolvedRegion),
        DOCTOR_POSITIONS_TIMEOUT_MS,
      )) as Record<string, unknown>[];
      positionsCount = positions.length;
      activeSymbols = Array.from(
        new Set(positions.map((p) => safeString(p.symbol)?.toUpperCase()).filter((s): s is string => Boolean(s))),
      ).slice(0, 8);
      positionsStepStatus = "pass";
    } catch (e) {
      positionsStepStatus = "fail";
      steps.push(doctorStep("positions_readable", "Positions readable", "fail", compactMetaError(e)));
    }
  } else {
    positionsStepStatus = "skipped";
  }
  if (positionsStepStatus !== "fail") {
    steps.push(
      doctorStep(
        "positions_readable",
        "Positions readable",
        positionsStepStatus,
        positionsStepStatus === "pass"
          ? `${positionsCount ?? 0} open position${positionsCount === 1 ? "" : "s"} readable.`
          : "Skipped because broker data is not reachable yet.",
      ),
    );
  }

  if (brokerStepStatus === "pass") {
    try {
      const end = new Date();
      const start = new Date(end.getTime() - 14 * 24 * 60 * 60 * 1000);
      const deals = await withActionBudget(
        "doctor_history",
        clientGetHistoryDealsRange(extId, start.toISOString(), end.toISOString(), resolvedRegion),
        DOCTOR_HISTORY_TIMEOUT_MS,
      );
      historyDealsChecked = deals.length;
      historyStepStatus = "pass";
    } catch (e) {
      historyStepStatus = "fail";
      steps.push(doctorStep("history_readable", "History readable", "fail", compactMetaError(e)));
    }
  } else {
    historyStepStatus = "skipped";
  }
  if (historyStepStatus !== "fail") {
    steps.push(
      doctorStep(
        "history_readable",
        "History readable",
        historyStepStatus,
        historyStepStatus === "pass"
          ? `${historyDealsChecked ?? 0} recent history deal${historyDealsChecked === 1 ? "" : "s"} returned.`
          : "Skipped because broker data is not reachable yet.",
      ),
    );
  }

  const chartSnapshot = Array.isArray(chartRes.data) ? (chartRes.data[0] as Record<string, unknown> | undefined) : undefined;
  const chartSymbol = safeString(chartSnapshot?.broker_symbol) ?? safeString(chartSnapshot?.display_symbol);
  const priceSymbol = activeSymbols[0] ?? chartSymbol;
  if (brokerStepStatus === "pass" && priceSymbol) {
    priceSymbolChecked = priceSymbol;
    try {
      const price = await withActionBudget(
        "doctor_live_price",
        clientGetSymbolPrice(extId, priceSymbol, resolvedRegion),
        DOCTOR_PRICE_TIMEOUT_MS,
      );
      const hasPrice = price.bid != null || price.ask != null;
      priceStepStatus = hasPrice ? "pass" : "warn";
      steps.push(
        doctorStep(
          "live_prices_available",
          "Live price available",
          priceStepStatus,
          hasPrice
            ? `${priceSymbol}: bid ${price.bid ?? "—"} · ask ${price.ask ?? "—"}.`
            : `${priceSymbol}: MetaAPI responded without bid/ask.`,
        ),
      );
    } catch (e) {
      priceStepStatus = "fail";
      steps.push(doctorStep("live_prices_available", "Live price available", "fail", compactMetaError(e)));
    }
  } else {
    steps.push(
      doctorStep(
        "live_prices_available",
        "Live price available",
        "skipped",
        brokerStepStatus === "pass"
          ? "No open-position or recent chart symbol was available to probe."
          : "Skipped because broker data is not reachable yet.",
      ),
    );
  }

  steps.push(
    doctorStep(
      "trading_permission",
      "Trading permission",
      liveTradingEnabled ? "warn" : "pass",
      liveTradingEnabled
        ? "AXE live trading is enabled; every order still requires explicit confirmation. Broker trade permission is not probed without placing an order."
        : "AXE is in read-only mode. No live orders can be sent from Companion.",
    ),
  );
  steps.push(
    doctorStep(
      "sync_freshness",
      "Last sync freshness",
      lastSyncAgeMinutes == null ? "warn" : lastSyncAgeMinutes <= 120 ? "pass" : "warn",
      lastSyncAgeMinutes == null ? "No completed sync recorded yet." : `Last sync ${lastSyncAgeMinutes} minutes ago.`,
    ),
  );
  steps.push(
    doctorStep(
      "known_failure_reason",
      "Known failure reason",
      knownFailure ? "warn" : "pass",
      knownFailure ?? "No stored failure reason on this account.",
    ),
  );

  const overallStatus = overallFromDoctor({
    providerStatus,
    liveTradingEnabled,
    deploymentStatus: provisioningStepStatus,
    terminalStatus: terminalStepStatus,
    brokerStatus: brokerStepStatus,
    positionsStatus: positionsStepStatus,
    historyStatus: historyStepStatus,
    priceStatus: priceStepStatus,
    knownFailure,
  });
  const headline = doctorHeadline(overallStatus);
  const summary = [
    headline,
    brokerServer ? `Server ${brokerServer}.` : null,
    positionsCount != null ? `${positionsCount} open positions readable.` : null,
    lastSyncAgeMinutes != null ? `Last sync ${lastSyncAgeMinutes}m ago.` : "No completed sync recorded.",
    liveTradingEnabled ? "Live trading flag is on." : "Read-only mode is on.",
  ]
    .filter(Boolean)
    .join(" ");

  const report: Mt5DoctorReport = {
    accountId,
    accountLabel: String(row.label ?? "MT5 Account"),
    checkedAt,
    overallStatus,
    headline,
    summary,
    providerStatus,
    deploymentState,
    terminalStatus,
    brokerServer,
    brokerName,
    loginMasked,
    liveTradingEnabled,
    lastSyncAt,
    lastSyncAgeMinutes,
    activeSymbols,
    positionsCount,
    historyDealsChecked,
    priceSymbolChecked,
    knownFailureReason: knownFailure,
    steps,
  };

  await supabase
    .from("user_broker_accounts")
    .update({ metadata: { ...prevMeta, ...(resolvedRegion ? { metaapiRegion: resolvedRegion } : {}), lastDoctor: report } })
    .eq("id", accountId)
    .eq("user_id", user.id);

  revalidatePath("/accounts");
  revalidatePath("/chat");

  return { ok: true, data: report };
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
