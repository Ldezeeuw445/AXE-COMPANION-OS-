import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChartActionType } from "@/lib/axeChartActions/chartActionTypes";

export type PendingChartActionRow = {
  id: string;
  action_type: ChartActionType;
  symbol: string;
  timeframe: string;
  account_id: string | null;
  payload: Record<string, unknown>;
  status: string;
  created_at: string;
};

export async function queueChartAction(
  supabase: SupabaseClient,
  userId: string,
  args: {
    actionType: ChartActionType;
    symbol: string;
    timeframe?: string;
    accountId?: string;
    payload?: Record<string, unknown>;
  },
): Promise<{ id: string; href: string }> {
  const symbol = args.symbol.trim().toUpperCase();
  const timeframe = (args.timeframe ?? "h1").trim().toLowerCase();
  const { data, error } = await supabase
    .from("axe_pending_chart_actions")
    .insert({
      user_id: userId,
      action_type: args.actionType,
      symbol,
      timeframe,
      account_id: args.accountId ?? null,
      payload: args.payload ?? {},
      status: "pending",
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to queue chart action");
  }

  const params = new URLSearchParams({
    symbol,
    tf: timeframe,
    action: args.actionType,
    queued: data.id,
  });
  return { id: data.id, href: `/chart?${params.toString()}` };
}

export async function listPendingChartActions(
  supabase: SupabaseClient,
  userId: string,
  symbol?: string,
  timeframe?: string,
): Promise<PendingChartActionRow[]> {
  let q = supabase
    .from("axe_pending_chart_actions")
    .select("id,action_type,symbol,timeframe,account_id,payload,status,created_at")
    .eq("user_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(10);

  if (symbol) q = q.eq("symbol", symbol.trim().toUpperCase());
  if (timeframe) q = q.eq("timeframe", timeframe.trim().toLowerCase());

  const { data, error } = await q;
  if (error) {
    console.error("[chartActionQueueService] list error:", error.message);
    return [];
  }
  return (data ?? []) as PendingChartActionRow[];
}

export async function consumePendingChartAction(
  supabase: SupabaseClient,
  userId: string,
  id: string,
): Promise<void> {
  await supabase
    .from("axe_pending_chart_actions")
    .update({ status: "consumed", consumed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId);
}
