import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AccountConnection,
  BrokerSymbolMapping,
  DatabaseAdapter,
} from "../contract";
import {
  accountConnectionToDbPatch,
  dbRowToAccountConnection,
  type BrokerAccountDbRow,
} from "../mappers";

export class SupabaseDatabaseAdapter implements DatabaseAdapter {
  constructor(private readonly supabase: SupabaseClient) {}

  async listAccounts(userId: string): Promise<AccountConnection[]> {
    const { data, error } = await this.supabase
      .from("user_broker_accounts")
      .select(
        "id,user_id,label,provider,status,connection_method,provider_status,last_sync_at,created_at,hub_broker_id,trading_mode,hub_status,hub_permissions,metadata,masked_login,mt5_server",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return ((data ?? []) as BrokerAccountDbRow[]).map(dbRowToAccountConnection);
  }

  async getAccount(accountId: string): Promise<AccountConnection | null> {
    const { data, error } = await this.supabase
      .from("user_broker_accounts")
      .select(
        "id,user_id,label,provider,status,connection_method,provider_status,last_sync_at,created_at,hub_broker_id,trading_mode,hub_status,hub_permissions,metadata,masked_login,mt5_server",
      )
      .eq("id", accountId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;
    return dbRowToAccountConnection(data as BrokerAccountDbRow);
  }

  async saveAccount(account: AccountConnection): Promise<AccountConnection> {
    const patch = accountConnectionToDbPatch(account);
    const { data, error } = await this.supabase
      .from("user_broker_accounts")
      .update(patch)
      .eq("id", account.id)
      .select(
        "id,user_id,label,provider,status,connection_method,provider_status,last_sync_at,created_at,hub_broker_id,trading_mode,hub_status,hub_permissions,metadata,masked_login,mt5_server",
      )
      .single();

    if (error) throw new Error(error.message);
    return dbRowToAccountConnection(data as BrokerAccountDbRow);
  }

  async deleteAccount(accountId: string): Promise<void> {
    const { error } = await this.supabase
      .from("user_broker_accounts")
      .delete()
      .eq("id", accountId);
    if (error) throw new Error(error.message);
  }

  async listSymbolMappings(accountId: string): Promise<BrokerSymbolMapping[]> {
    const { data: tableRows, error } = await this.supabase
      .from("broker_symbol_mappings")
      .select(
        "id,account_id,canonical_symbol,broker_symbol,asset_class,exchange,multiplier,notes",
      )
      .eq("account_id", accountId);

    if (error) throw new Error(error.message);

    if (tableRows && tableRows.length > 0) {
      return tableRows.map((r) => ({
        id: String(r.id),
        accountId: String(r.account_id),
        canonicalSymbol: String(r.canonical_symbol),
        brokerSymbol: String(r.broker_symbol),
        assetClass: (r.asset_class ?? "other") as BrokerSymbolMapping["assetClass"],
        exchange: r.exchange ?? undefined,
        multiplier: r.multiplier != null ? Number(r.multiplier) : undefined,
        notes: r.notes ?? undefined,
      }));
    }

    // Fallback: legacy MT5 symbol_map in account metadata
    const { data: acct } = await this.supabase
      .from("user_broker_accounts")
      .select("metadata")
      .eq("id", accountId)
      .maybeSingle();

    const meta = acct?.metadata;
    const symbolMap =
      meta && typeof meta === "object" && !Array.isArray(meta)
        ? (meta as Record<string, unknown>).symbol_map
        : null;

    if (!symbolMap || typeof symbolMap !== "object" || Array.isArray(symbolMap)) {
      return [];
    }

    return Object.entries(symbolMap as Record<string, string>).map(([canonical, broker]) => ({
      id: `meta:${accountId}:${canonical}`,
      accountId,
      canonicalSymbol: canonical,
      brokerSymbol: broker,
      assetClass: "other" as const,
      notes: "Imported from metadata.symbol_map",
    }));
  }

  async saveSymbolMapping(mapping: BrokerSymbolMapping): Promise<BrokerSymbolMapping> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error("Not signed in");

    const row = {
      user_id: user.id,
      account_id: mapping.accountId,
      canonical_symbol: mapping.canonicalSymbol,
      broker_symbol: mapping.brokerSymbol,
      asset_class: mapping.assetClass,
      exchange: mapping.exchange ?? null,
      multiplier: mapping.multiplier ?? null,
      notes: mapping.notes ?? null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await this.supabase
      .from("broker_symbol_mappings")
      .upsert(row, { onConflict: "account_id,canonical_symbol" })
      .select(
        "id,account_id,canonical_symbol,broker_symbol,asset_class,exchange,multiplier,notes",
      )
      .single();

    if (error) throw new Error(error.message);

    return {
      id: String(data.id),
      accountId: String(data.account_id),
      canonicalSymbol: String(data.canonical_symbol),
      brokerSymbol: String(data.broker_symbol),
      assetClass: (data.asset_class ?? "other") as BrokerSymbolMapping["assetClass"],
      exchange: data.exchange ?? undefined,
      multiplier: data.multiplier != null ? Number(data.multiplier) : undefined,
      notes: data.notes ?? undefined,
    };
  }
}
