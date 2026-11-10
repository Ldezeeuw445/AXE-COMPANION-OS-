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

/**
 * TOS-SEC-2: the hub's account store, bound to one owner.
 *
 * The contract hands these methods an `accountId` that came off a request body
 * (`src/app/api/broker/hub/route.ts` reads `body.accountId`), and the hub
 * service does not check who owns it — `getAccount` returning null is what
 * makes `disconnectAccount` and `updatePermissions` no-op. That check used to
 * be row-level security alone: every statement here filtered on `id`, so the
 * only thing keeping one trader off another's row was the client being
 * RLS-scoped.
 *
 * That is the assumption TOS-SEC-2 removes. The same route already filters
 * `user_id` on its own sync write, and `syncWriteClient` states the rule the
 * MT5 path follows: establish ownership through the caller's own client, and
 * still filter `user_id` on every write so a wrong id cannot reach another
 * trader's row even once RLS is no longer the thing stopping it.
 *
 * So the adapter now carries the owner and filters on it everywhere, matching
 * the secrets adapter beside it. For a legitimate caller nothing changes —
 * RLS was already returning only their rows — and the grant this file holds
 * open in `src/lib/mt5/revokeBlockers.test.ts` stops depending on the client.
 */
export class SupabaseDatabaseAdapter implements DatabaseAdapter {
  // Declared and assigned rather than written as constructor parameter
  // properties: `npm test` runs Node's type-stripping, which rejects those
  // outright (ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX), so the parameter-property
  // form made this class impossible to import from a test at all.
  private readonly supabase: SupabaseClient;
  private readonly userId: string;

  constructor(supabase: SupabaseClient, userId: string) {
    this.supabase = supabase;
    this.userId = userId;
  }

  async listAccounts(userId: string): Promise<AccountConnection[]> {
    // The contract passes the id in and the constructor binds it; in production
    // both come from the same session. If they ever disagree the hub has been
    // wired to the wrong client, which should be loud rather than silently
    // answered from one of the two.
    if (userId !== this.userId) {
      throw new Error("Broker hub database adapter was built for a different user");
    }

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
      .eq("user_id", this.userId)
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
      .eq("user_id", this.userId)
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
      .eq("id", accountId)
      .eq("user_id", this.userId);
    if (error) throw new Error(error.message);
  }

  async listSymbolMappings(accountId: string): Promise<BrokerSymbolMapping[]> {
    const { data: tableRows, error } = await this.supabase
      .from("broker_symbol_mappings")
      .select(
        "id,account_id,canonical_symbol,broker_symbol,asset_class,exchange,multiplier,notes",
      )
      .eq("account_id", accountId)
      .eq("user_id", this.userId);

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
      .eq("user_id", this.userId)
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
    // Was `auth.getUser()` on the client. The hub is only ever built for an
    // authenticated session, so the bound owner is the same id — and reading it
    // from the client is the one thing here that would stop working if this
    // adapter were handed an elevated client, which is the direction TOS-SEC-2
    // is moving.
    const row = {
      user_id: this.userId,
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
