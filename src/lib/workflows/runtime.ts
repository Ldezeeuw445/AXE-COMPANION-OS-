import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  getEodhdKey,
  getFinnhubKey,
  getFredKey,
  getPerigonKey,
} from "@/lib/market/providerStatus";
import type { WorkflowRuntime } from "@/lib/workflows/status";

export type ActionRuntime = Omit<WorkflowRuntime, "hasNews" | "hasMacro">;

export async function detectActionRuntime(): Promise<ActionRuntime> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return {
      hasActiveAccount: false,
      hasOpenPositions: false,
      hasTradeHistory: false,
      hasJournal: false,
      hasMemory: false,
    };
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      hasActiveAccount: false,
      hasOpenPositions: false,
      hasTradeHistory: false,
      hasJournal: false,
      hasMemory: false,
    };
  }
  const { data } = await supabase
    .from("user_broker_accounts")
    .select("id,connection_method,external_connection_id,provider_status")
    .eq("user_id", user.id)
    .in("connection_method", ["cloud_mt5", "cloud_alpaca", "demo_paper"])
    .limit(20);
  const activeAccount = Array.isArray(data)
    ? data.find((a) => {
        const statusOk = ["connected", "provisioned"].includes(String(a.provider_status ?? "").toLowerCase());
        if (a.connection_method === "cloud_mt5") {
          return statusOk && Boolean(a.external_connection_id);
        }
        return statusOk;
      }) ?? data[0]
    : null;
  const accountId = activeAccount?.id as string | undefined;
  const [positions, trades, journalNotes, tradeLabels, memory] = await Promise.all([
    accountId
      ? supabase
          .from("mt5_positions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("account_id", accountId)
      : Promise.resolve({ count: 0 }),
    accountId
      ? supabase
          .from("broker_trades")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("account_id", accountId)
      : Promise.resolve({ count: 0 }),
    supabase.from("user_journal_entries").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("trade_journal_labels").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("assistant_memory_entries").select("id", { count: "exact", head: true }).eq("user_id", user.id),
  ]);
  const journalActivity = (journalNotes.count ?? 0) + (tradeLabels.count ?? 0);
  return {
    hasActiveAccount: Boolean(activeAccount),
    hasOpenPositions: (positions.count ?? 0) > 0,
    hasTradeHistory: (trades.count ?? 0) > 0,
    hasJournal: journalActivity > 0,
    hasMemory: (memory.count ?? 0) > 0,
  };
}

export function buildWorkflowRuntime(
  runtime: ActionRuntime,
  hasNews?: boolean,
  hasMacro?: boolean,
): WorkflowRuntime {
  const news = hasNews ?? Boolean(getPerigonKey() || getFinnhubKey() || getEodhdKey());
  const macro = hasMacro ?? (Boolean(getFredKey()) || news);
  return { ...runtime, hasNews: news, hasMacro: macro };
}
