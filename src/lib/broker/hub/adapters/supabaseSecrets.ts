import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConfigSecretsAdapter } from "../contract";

/**
 * Stores credential *presence* and hints only — never raw secrets in Supabase.
 * MT5 passwords go to MetaApi at connect time; Alpaca/IBKR will use vault_key later.
 */
export class SupabaseSecretsAdapter implements ConfigSecretsAdapter {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly userId: string,
  ) {}

  async storeCredentials(accountId: string, credentials: Record<string, string>): Promise<void> {
    const hints: Record<string, string> = {};
    for (const [key, value] of Object.entries(credentials)) {
      if (!value || key.startsWith("_")) continue;
      if (key.toLowerCase().includes("secret") || key.toLowerCase().includes("password")) {
        hints[key] = value.length > 4 ? `••••${value.slice(-4)}` : "••••";
      } else {
        hints[key] = value.length > 32 ? `${value.slice(0, 8)}…` : value;
      }
    }

    const { error } = await this.supabase.from("broker_connection_secrets").upsert(
      {
        account_id: accountId,
        user_id: this.userId,
        vault_provider: "server",
        has_credentials: Object.keys(credentials).length > 0,
        credential_hints: hints,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "account_id" },
    );

    if (error) throw new Error(error.message);
  }

  async loadCredentials(_accountId: string): Promise<Record<string, string> | null> {
    // Secrets are not loaded from Supabase — host uses MetaApi / vault.
    return null;
  }

  async deleteCredentials(accountId: string): Promise<void> {
    const { error } = await this.supabase
      .from("broker_connection_secrets")
      .delete()
      .eq("account_id", accountId)
      .eq("user_id", this.userId);
    if (error) throw new Error(error.message);
  }
}
