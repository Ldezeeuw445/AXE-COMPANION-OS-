import type { SupabaseClient } from "@supabase/supabase-js";
import type { BrokerAccountRow } from "@/lib/broker/loadAccountsPageData";
import { DEMO_CONNECTION_METHOD } from "@/lib/broker/accountKind";
import { DEMO_EXTERNAL_ID, DEMO_WATCHLIST_SYMBOLS } from "@/lib/broker/demoAccount";
import { sessionIsUser, syncWriteClient } from "@/lib/supabase/syncWriteClient";

/**
 * Creating the built-in demo account row. Split from `demoAccount.ts`, which
 * keeps the demo price and candle math, because this half writes on the
 * server-only elevated client (TOS-SEC-2) and the math is also used by client
 * code and plain-tsx checks.
 */

const DEMO_BALANCE = 100_000;

type DemoAccountRow = Pick<
  BrokerAccountRow,
  | "id"
  | "label"
  | "provider"
  | "status"
  | "mt5_login"
  | "mt5_server"
  | "created_at"
  | "connection_method"
  | "external_connection_id"
  | "provider_status"
  | "last_sync_at"
  | "masked_login"
  | "metadata"
>;

export async function ensureDemoAccount(
  supabase: SupabaseClient,
  userId: string,
): Promise<DemoAccountRow | null> {
  const { data: existing, error: existingErr } = await supabase
    .from("user_broker_accounts")
    .select(
      "id,label,provider,status,mt5_login,mt5_server,created_at,connection_method,external_connection_id,provider_status,last_sync_at,masked_login,metadata",
    )
    .eq("user_id", userId)
    .eq("connection_method", DEMO_CONNECTION_METHOD)
    .maybeSingle();

  if (existingErr) {
    // Surface DB issues to server logs — silent failure is what masked the
    // CHECK-constraint regression that hid demo accounts from every user.
    console.warn("[demoAccount] lookup failed", existingErr.message ?? existingErr);
    return null;
  }
  if (existing) return existing as DemoAccountRow;

  // The row is server-defined (provider_status "connected", a fixed balance),
  // so it goes out elevated and the trader's INSERT grant is not what creates
  // it (TOS-SEC-2). Elevated means RLS no longer checks user_id, so the session
  // has to.
  if (!(await sessionIsUser(supabase, userId))) {
    console.warn("[demoAccount] session does not match the account owner; not creating");
    return null;
  }

  const now = new Date().toISOString();
  const { data: created, error: createErr } = await syncWriteClient(supabase)
    .from("user_broker_accounts")
    .insert({
      user_id: userId,
      provider: "demo",
      label: "AXE Demo Account",
      status: "active",
      connection_method: DEMO_CONNECTION_METHOD,
      external_connection_id: DEMO_EXTERNAL_ID,
      provider_status: "connected",
      mt5_login: null,
      mt5_server: "AXE Paper",
      masked_login: "DEMO",
      last_sync_at: now,
      metadata: {
        demo: true,
        balance: DEMO_BALANCE,
        equity: DEMO_BALANCE,
        currency: "USD",
        description: "Virtual paper trading account. No broker execution.",
      },
    })
    .select(
      "id,label,provider,status,mt5_login,mt5_server,created_at,connection_method,external_connection_id,provider_status,last_sync_at,masked_login,metadata",
    )
    .single();

  if (createErr) {
    console.warn("[demoAccount] insert failed", {
      code: createErr.code,
      message: createErr.message,
      details: createErr.details,
      hint: createErr.hint,
    });
    return null;
  }
  return created as DemoAccountRow;
}

export async function ensureActiveDemoWhenEmpty(
  supabase: SupabaseClient,
  userId: string,
  activeAccountId: string | null | undefined,
  accounts: BrokerAccountRow[],
): Promise<{ accounts: BrokerAccountRow[]; activeAccountId: string | null }> {
  const demo = await ensureDemoAccount(supabase, userId);
  const nextAccounts = demo && !accounts.some((a) => a.id === demo.id) ? [demo, ...accounts] : accounts;
  const nextActive = activeAccountId ?? demo?.id ?? null;

  if (!activeAccountId && demo?.id) {
    await supabase.from("user_workspace_preferences").upsert(
      {
        user_id: userId,
        active_account_id: demo.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
  }

  return { accounts: nextAccounts, activeAccountId: nextActive };
}

/** Seed demo account, active workspace, and default watchlist for landing-page demos. */
export async function ensureDemoWorkspace(
  supabase: SupabaseClient,
  userId: string,
): Promise<DemoAccountRow | null> {
  const demo = await ensureDemoAccount(supabase, userId);
  if (!demo) return null;

  await ensureActiveDemoWhenEmpty(supabase, userId, null, [demo]);

  const { count, error: countErr } = await supabase
    .from("assistant_memory_entries")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("scope", "watchlist");

  if (countErr) {
    console.warn("[demoAccount] watchlist count failed", countErr.message ?? countErr);
    return demo;
  }

  if ((count ?? 0) === 0) {
    const now = new Date().toISOString();
    const rows = DEMO_WATCHLIST_SYMBOLS.map((symbol) => ({
      user_id: userId,
      scope: "watchlist",
      entry_key: symbol,
      content: symbol,
      created_at: now,
      updated_at: now,
    }));
    const { error: seedErr } = await supabase.from("assistant_memory_entries").upsert(rows, {
      onConflict: "user_id,scope,entry_key",
    });
    if (seedErr) {
      console.warn("[demoAccount] watchlist seed failed", seedErr.message ?? seedErr);
    }
  }

  return demo;
}
