import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  groupTradesByAccount,
  readAccountSnapshot,
  reconcileAccountLedger,
  type AccountLedger,
} from "@/lib/account/reconcileAccountLedger";
import { asFiniteNumber } from "@/lib/journal/tradePnl";
import { ensureActiveDemoWhenEmpty } from "@/lib/broker/demoAccount";
import { isAccountOffered, isDemoBrokerEnabled } from "@/lib/broker/brokerAvailability";
import { ensureAlpacaPaperAccount } from "@/lib/alpaca/provision";
import { isAlpacaConfigured } from "@/lib/alpaca/env";

export type BrokerAccountRow = {
  id: string;
  label: string;
  provider: string;
  status: string;
  mt5_login: string | null;
  mt5_server: string | null;
  created_at: string;
  connection_method?: string | null;
  external_connection_id?: string | null;
  provider_status?: string | null;
  last_sync_at?: string | null;
  masked_login?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type AccountsPageData = {
  accounts: BrokerAccountRow[];
  activeAccountId: string | null;
  ledgers: Record<string, AccountLedger>;
  error: string | null;
};

/** Server-only loader for /accounts — RLS applies via authenticated Supabase client. */
export async function loadAccountsPageData(): Promise<AccountsPageData> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return {
      accounts: [],
      activeAccountId: null,
      ledgers: {},
      error: "Supabase is not configured.",
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      accounts: [],
      activeAccountId: null,
      ledgers: {},
      error: "Not signed in.",
    };
  }

  const [accsRes, prefsRes] = await Promise.all([
    supabase
      .from("user_broker_accounts")
      .select(
        "id,label,provider,status,mt5_login,mt5_server,created_at,connection_method,external_connection_id,provider_status,last_sync_at,masked_login,metadata",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("user_workspace_preferences")
      .select("active_account_id")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (accsRes.error) {
    return {
      accounts: [],
      activeAccountId: null,
      ledgers: {},
      error: accsRes.error.message,
    };
  }

  const prefsErr = prefsRes.error?.message;
  let accounts = ((accsRes.data ?? []) as BrokerAccountRow[]).filter(isAccountOffered);
  const seeded = isDemoBrokerEnabled()
    ? await ensureActiveDemoWhenEmpty(
        supabase,
        user.id,
        prefsRes.data?.active_account_id ?? null,
        accounts,
      )
    : { accounts, activeAccountId: prefsRes.data?.active_account_id ?? null };

  accounts = seeded.accounts;
  const activeAccountId = seeded.activeAccountId;

  if (isAlpacaConfigured()) {
    const alpaca = await ensureAlpacaPaperAccount(supabase, user.id);
    if (alpaca.ok) {
      const { data: refreshed, error: refreshErr } = await supabase
        .from("user_broker_accounts")
        .select(
          "id,label,provider,status,mt5_login,mt5_server,created_at,connection_method,external_connection_id,provider_status,last_sync_at,masked_login,metadata",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (!refreshErr && refreshed) {
        accounts = refreshed as BrokerAccountRow[];
      }
    }
  }

  const { data: tradeRows } = await supabase
    .from("broker_trades")
    .select("account_id,pnl,fees")
    .eq("user_id", user.id)
    .not("close_time", "is", null);

  const grouped = groupTradesByAccount(
    (tradeRows ?? []).map((r) => ({
      accountId: String((r as { account_id: string }).account_id),
      pnl: asFiniteNumber((r as { pnl: unknown }).pnl, 0),
      fees: asFiniteNumber((r as { fees: unknown }).fees, 0),
    })),
  );

  const ledgers: Record<string, AccountLedger> = {};
  for (const account of accounts) {
    ledgers[account.id] = reconcileAccountLedger({
      accountId: account.id,
      trades: grouped.get(account.id) ?? [],
      snapshot: readAccountSnapshot(account.metadata ?? null),
    });
  }

  return {
    accounts,
    activeAccountId,
    ledgers,
    error: prefsErr ?? null,
  };
}
