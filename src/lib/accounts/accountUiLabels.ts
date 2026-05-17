/** User-facing labels for Accounts — avoid raw API codes in primary UI. */

export function friendlyProviderStatus(raw: string | null | undefined): string {
  const v = (raw ?? "").toLowerCase().trim();
  if (!v || v === "unknown") return "Needs sync";
  const map: Record<string, string> = {
    connected: "Connected",
    provisioned: "Connected",
    provisioning: "Provisioning",
    connecting: "Syncing",
    syncing: "Syncing",
    sync_in_progress: "Syncing",
    recovering: "Reconnecting",
    recovery_failed: "Needs attention",
    orphaned: "Needs reconnect",
    pending: "Needs sync",
    needs_sync: "Needs sync",
    disconnected: "Disconnected",
    cloud_mt5_disconnected: "Disconnected",
    failed: "Failed",
    sync_failed: "Failed",
    invalid_credentials: "Failed",
    provider_not_configured: "Provider not configured",
    not_found: "Needs setup",
    metaapi_auth_failed: "Failed",
    metaapi_region_error: "Failed",
    metaapi_timeout: "Failed",
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
  if (m === "cloud_mt5" && hasExternalId) return "MetaApi Cloud";
  if (m === "cloud_mt5" || m === "cloud_mt5_disconnected") return "MetaApi Cloud";
  return "Local bridge (token)";
}
