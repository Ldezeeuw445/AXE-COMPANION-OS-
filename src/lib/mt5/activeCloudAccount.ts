import type { SupabaseClient } from "@supabase/supabase-js";

export type ActiveMetaApiCloud = {
  /** user_broker_accounts.id */
  brokerAccountId: string;
  /** MetaApi trading account id */
  metaApiAccountId: string;
};

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
    .select("id,connection_method,external_connection_id")
    .eq("user_id", userId)
    .eq("id", activeId)
    .maybeSingle();

  if (!row?.external_connection_id) return null;
  if (row.connection_method !== "cloud_mt5") return null;

  return {
    brokerAccountId: row.id as string,
    metaApiAccountId: row.external_connection_id as string,
  };
}
