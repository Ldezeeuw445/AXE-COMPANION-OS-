/** User-facing labels for Accounts — avoid raw API codes in primary UI. */

export function friendlyProviderStatus(raw: string | null | undefined): string {
  const v = (raw ?? "").toLowerCase().trim();
  if (!v || v === "unknown") return "Needs sync";
  const map: Record<string, string> = {
    connected: "Fresh",
    provisioned: "Recently synced",
    provisioning: "Syncing",
    connecting: "Syncing",
    syncing: "Syncing",
    sync_in_progress: "Syncing",
    recovering: "Reconnecting",
    recovery_failed: "Connection issue",
    orphaned: "Connection issue",
    pending: "Needs sync",
    needs_sync: "Needs sync",
    disconnected: "Live data unavailable",
    cloud_mt5_disconnected: "Live data unavailable",
    failed: "Connection issue",
    sync_failed: "Connection issue",
    invalid_credentials: "Credentials issue",
    provider_not_configured: "AXE MT5 Cloud not configured",
    not_found: "Needs setup",
    metaapi_auth_failed: "Connection issue",
    metaapi_region_error: "Connection issue",
    metaapi_timeout: "Data stale",
  };
  return map[v] ?? capitalizeWords(v.replace(/_/g, " "));
}

function capitalizeWords(s: string): string {
  return s
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function accountMethodLabel(connectionMethod: string | null | undefined, hasExternalId: boolean): string {
  const m = (connectionMethod ?? "").toLowerCase();
  if (m === "cloud_alpaca") return "Alpaca Paper";
  if (m === "cloud_mt5" && hasExternalId) return "AXE MT5 Cloud";
  if (m === "cloud_mt5" || m === "cloud_mt5_disconnected") return "AXE MT5 Cloud";
  return "Local bridge (token)";
}
