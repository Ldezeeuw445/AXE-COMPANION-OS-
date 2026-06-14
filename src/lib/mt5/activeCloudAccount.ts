import type { SupabaseClient } from "@supabase/supabase-js";

export type ActiveMetaApiCloud = {
  /** user_broker_accounts.id */
  brokerAccountId: string;
  /** MetaApi trading account id */
  metaApiAccountId: string;
  /** MetaApi region the cloud terminal lives in (london / new-york / singapore). */
  metaApiRegion: string | null;
};

/** MetaApi cloud credentials for a specific broker account row. */
export async function getMetaApiCloudAccountById(
  supabase: SupabaseClient,
  userId: string,
  brokerAccountId: string,
): Promise<ActiveMetaApiCloud | null> {
  const { data: row } = await supabase
    .from("user_broker_accounts")
    .select("id,connection_method,external_connection_id,metadata")
    .eq("user_id", userId)
    .eq("id", brokerAccountId)
    .maybeSingle();

  if (!row?.external_connection_id) return null;
  if (row.connection_method !== "cloud_mt5") return null;

  const meta =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};
  const region = typeof meta.metaapiRegion === "string" ? meta.metaapiRegion : null;

  return {
    brokerAccountId: row.id as string,
    metaApiAccountId: row.external_connection_id as string,
    metaApiRegion: region,
  };
}

/** Active workspace account when it is a linked MetaApi cloud row. */
export async function getActiveMetaApiCloudAccount(
  supabase: SupabaseClient,
  userId: string,
): Promise<ActiveMetaApiCloud | null> {
  const { data: prefs } = await supabase
    .from("user_workspace_preferences")
    .select("active_account_id")
    .eq("user_id", userId)
    .maybeSingle();

  const activeId = prefs?.active_account_id as string | null | undefined;
  if (!activeId) return null;

  const { data: row } = await supabase
    .from("user_broker_accounts")
    .select("id,connection_method,external_connection_id,metadata")
    .eq("user_id", userId)
    .eq("id", activeId)
    .maybeSingle();

  if (!row?.external_connection_id) return null;
  if (row.connection_method !== "cloud_mt5") return null;

  const meta =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};
  const region = typeof meta.metaapiRegion === "string" ? meta.metaapiRegion : null;

  return {
    brokerAccountId: row.id as string,
    metaApiAccountId: row.external_connection_id as string,
    metaApiRegion: region,
  };
}
