/**
 * Server-only. Our own MT5 bridge (services/mt5-bridge) as a MetaApi "region".
 *
 * The bridge answers MetaApi's client REST API from one MT5 terminal that we
 * run ourselves. An account whose `metadata.metaapiRegion` is "bridge" and
 * whose external id is MT5_BRIDGE_ACCOUNT_ID goes there instead of to MetaApi;
 * every other account is untouched. Added 21 Nov 2026, during the MetaApi
 * outage that started 19 Nov, so one provider going down no longer stops MT5.
 *
 * Env (all three, or the bridge is off):
 *   MT5_BRIDGE_URL         https://… (Cloudflare tunnel to the bridge)
 *   MT5_BRIDGE_TOKEN       shared secret, sent as `auth-token` like MetaApi's
 *   MT5_BRIDGE_ACCOUNT_ID  the account id the bridge answers to
 */

export const MT5_BRIDGE_REGION = "bridge";

export type Mt5BridgeConfig = { url: string; token: string; accountId: string };

export function getMt5BridgeConfig(): Mt5BridgeConfig | null {
  const url = process.env.MT5_BRIDGE_URL?.trim().replace(/\/$/, "") ?? "";
  const token = process.env.MT5_BRIDGE_TOKEN?.trim() ?? "";
  const accountId = process.env.MT5_BRIDGE_ACCOUNT_ID?.trim() ?? "";
  if (!url || !token || !accountId) return null;
  return { url, token, accountId };
}

export function isBridgeRegion(region: string | null | undefined): boolean {
  return (region ?? "").trim().toLowerCase() === MT5_BRIDGE_REGION;
}

export function isBridgeAccountId(accountId: string | null | undefined): boolean {
  const cfg = getMt5BridgeConfig();
  return cfg != null && !!accountId && accountId === cfg.accountId;
}

/** True when `base` is the bridge's URL, so its token (not MetaApi's) is sent. */
export function isBridgeBase(base: string): boolean {
  const cfg = getMt5BridgeConfig();
  return cfg != null && base === cfg.url;
}

export type Mt5BridgeStatus = {
  connected: boolean;
  login?: number | null;
  server?: string | null;
  reason?: string;
};

let cached: { at: number; status: Mt5BridgeStatus } | null = null;

/**
 * The bridge's own view of its terminal. Never throws: an unreachable bridge
 * reads as "not connected", exactly how a down MetaApi account reads.
 */
export async function readMt5BridgeStatus(): Promise<Mt5BridgeStatus> {
  const cfg = getMt5BridgeConfig();
  if (!cfg) return { connected: false, reason: "bridge not configured" };
  if (cached && Date.now() - cached.at < 15_000) return cached.status;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10_000);
  let status: Mt5BridgeStatus;
  try {
    const res = await fetch(`${cfg.url}/status`, {
      headers: { Accept: "application/json", "auth-token": cfg.token },
      signal: ctrl.signal,
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    status = res.ok
      ? {
          connected: body.connected === true,
          login: typeof body.login === "number" ? body.login : null,
          server: typeof body.server === "string" ? body.server : null,
          reason: typeof body.reason === "string" ? body.reason : undefined,
        }
      : { connected: false, reason: `bridge status ${res.status}` };
  } catch (e) {
    status = { connected: false, reason: `bridge unreachable: ${e instanceof Error ? e.message : String(e)}` };
  } finally {
    clearTimeout(t);
  }
  cached = { at: Date.now(), status };
  return status;
}

/** Tests only. */
export function resetMt5BridgeStatusCache(): void {
  cached = null;
}
