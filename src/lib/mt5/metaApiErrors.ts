export type Mt5CloudErrorCode =
  | "provider_not_configured"
  | "metaapi_auth_failed"
  | "mt5_invalid_credentials"
  | "mt5_server_not_found"
  | "metaapi_resource_slots"
  | "metaapi_region_error"
  | "metaapi_timeout"
  | "sync_no_deals"
  | "sync_failed"
  | "disconnected"
  | "validation"
  | "forbidden"
  | "not_found"
  | "unknown";

const USER_MESSAGES: Record<Mt5CloudErrorCode, string> = {
  provider_not_configured:
    "MT5 cloud is not configured on the server (missing MetaApi token). Add METAAPI_TOKEN or AXE_MT5_METAAPI_TOKEN to the deployment environment.",
  metaapi_auth_failed: "MetaApi rejected the server token. Check METAAPI_TOKEN / AXE_MT5_METAAPI_TOKEN and that the token is valid for your MetaApi app.",
  mt5_invalid_credentials:
    "MetaTrader login, investor password, or server name was rejected by the broker. Double-check read-only password and exact server string from your broker.",
  mt5_server_not_found:
    "Broker server name was not found by MetaApi. Copy the server name exactly as shown in MT5 (File → Login to Trade Account), or create a provisioning profile in MetaApi for this broker.",
  metaapi_resource_slots:
    "This account needs more MetaApi resource slots than allocated. Increase resourceSlots in MetaApi account settings or contact support per MetaApi pricing guidance.",
  metaapi_region_error:
    "MetaApi client URL or region does not match this account. Verify METAAPI_CLIENT_API_URL and METAAPI_DEFAULT_REGION (London defaults are built in).",
  metaapi_timeout: "MetaApi or the broker terminal did not respond in time. Try Test or Sync again in a minute.",
  sync_no_deals: "Sync completed but no closed position deals were found in the last 90 days for this account.",
  sync_failed: "Sync could not finish. Check account status with Test, then try again.",
  disconnected: "This MetaApi connection was removed or is no longer available.",
  validation: "Some fields are missing or invalid. Check the form and try again.",
  forbidden: "Connecting an account is temporarily unavailable. This is on our side, not yours — we can see it and are on it.",
  not_found: "The MetaApi account was not found. It may have been deleted in MetaApi.",
  unknown: "Something went wrong talking to MetaApi. Try again or check server logs.",
};

/**
 * Codes that describe the platform's problem, not the trader's.
 *
 * A message must not hand someone a task they cannot do. `forbidden` used to
 * read "MetaApi denied this operation for your token permissions" — but there
 * is one MetaApi token for the whole app and a subscriber has no access to it.
 * They would read "your token", go looking for a setting that does not exist,
 * and write in. Worse, on 2026-09-09 the real cause turned out to be an empty
 * MetaApi balance, and the wording sent two people hunting token scopes for ten
 * minutes: HTTP 403 alone does not establish a reason, and the message asserted
 * one anyway.
 */
const OPERATOR_FAULT: ReadonlySet<Mt5CloudErrorCode> = new Set([
  "provider_not_configured",
  "metaapi_auth_failed",
  "metaapi_region_error",
  "metaapi_resource_slots",
  "forbidden",
]);

export function isOperatorFault(code: Mt5CloudErrorCode): boolean {
  return OPERATOR_FAULT.has(code);
}

/**
 * @param upstream MetaApi's own words, when the caller has them. Appended for
 *        operator-fault codes so the real reason — "insufficient balance",
 *        "token has no provisioning access" — reaches the logs and the
 *        operator instead of being replaced by our guess. Never shown for
 *        codes the trader can act on: their message is already the action.
 */
export function userMessageForCode(code: Mt5CloudErrorCode, upstream?: string | null): string {
  const base = USER_MESSAGES[code] ?? USER_MESSAGES.unknown;
  if (!upstream || !isOperatorFault(code)) return base;
  const trimmed = upstream.replace(/\s+/g, " ").trim().slice(0, 200);
  return trimmed ? `${base} (MetaApi: ${trimmed})` : base;
}

/** MetaApi's own message out of whatever shape the payload arrived in. */
export function upstreamMessage(payload: unknown): string | null {
  if (typeof payload === "string") return payload.slice(0, 300) || null;
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  for (const key of ["message", "error", "detail", "details"]) {
    const v = p[key];
    if (typeof v === "string" && v.trim()) return v.slice(0, 300);
  }
  return null;
}

export function classifyMetaApiProvisioningError(payload: unknown): Mt5CloudErrorCode {
  if (!payload || typeof payload !== "object") return "unknown";
  const p = payload as Record<string, unknown>;
  const details = p.details;
  if (typeof details === "string") {
    if (details === "E_AUTH") return "mt5_invalid_credentials";
    if (details === "E_SRV_NOT_FOUND") return "mt5_server_not_found";
  }
  if (details && typeof details === "object") {
    const d = details as Record<string, unknown>;
    if (d.code === "E_RESOURCE_SLOTS") return "metaapi_resource_slots";
    if (d.code === "E_SRV_NOT_FOUND") return "mt5_server_not_found";
  }
  const msg = String(p.message ?? "").toLowerCase();
  if (msg.includes("authenticate") || msg.includes("invalid account")) return "mt5_invalid_credentials";
  if (msg.includes("server") && msg.includes("not found")) return "mt5_server_not_found";
  if (msg.includes("resource slot")) return "metaapi_resource_slots";
  return "unknown";
}

export function classifyHttpStatus(status: number): Mt5CloudErrorCode {
  if (status === 401) return "metaapi_auth_failed";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 408 || status === 504) return "metaapi_timeout";
  return "unknown";
}
