import { createServerSupabaseClient } from "@/lib/supabase/server";

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
  error: string | null;
};

/** Server-only loader for /accounts — RLS applies via authenticated Supabase client. */
export async function loadAccountsPageData(): Promise<AccountsPageData> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return {
      accounts: [],
      activeAccountId: null,
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
      error: accsRes.error.message,
    };
  }

  const prefsErr = prefsRes.error?.message;
  return {
    accounts: (accsRes.data ?? []) as BrokerAccountRow[],
    activeAccountId: prefsRes.data?.active_account_id ?? null,
    error: prefsErr ?? null,
  };
}
