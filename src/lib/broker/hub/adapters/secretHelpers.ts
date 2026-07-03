import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptJson } from "./crypto";

export type StoredBrokerCredentials = Record<string, string>;

type SecretRow = {
  vault_key: string | null;
};

export async function loadStoredBrokerCredentials(
  supabase: SupabaseClient,
  accountId: string,
): Promise<StoredBrokerCredentials | null> {
  const { data, error } = await supabase
    .from("broker_connection_secrets")
    .select("vault_key")
    .eq("account_id", accountId)
    .maybeSingle<SecretRow>();

  if (error) throw new Error(error.message);
  if (!data?.vault_key) return null;

  return decryptJson<StoredBrokerCredentials>(data.vault_key);
}
