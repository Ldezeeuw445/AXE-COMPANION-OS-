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
  forbidden: "MetaApi denied this operation for your token permissions.",
  not_found: "The MetaApi account was not found. It may have been deleted in MetaApi.",
  unknown: "Something went wrong talking to MetaApi. Try again or check server logs.",
};

export function userMessageForCode(code: Mt5CloudErrorCode): string {
  return USER_MESSAGES[code] ?? USER_MESSAGES.unknown;
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
