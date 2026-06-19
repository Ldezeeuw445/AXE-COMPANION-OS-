import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChartActionType } from "@/lib/axeChartActions/chartActionTypes";
import { getTradeExecutionPrefsForUser } from "@/lib/trading/serverTradePrefs";
import { normalizeTradeVolume } from "@/lib/trading/tradeVolume";
import { queueChartAction } from "@/services/chartActionQueueService";
import { createExecutionRequest, type PrepareExecutionArgs } from "@/services/executionRequestService";

export type RouteChartActionArgs = {
  action_type: ChartActionType;
  symbol: string;
  timeframe?: string;
  account_id?: string;
  indicators?: string[];
  enable?: boolean;
  label?: string;
  payload?: Record<string, unknown>;
};

export async function handleRouteChartAction(
  supabase: SupabaseClient,
  userId: string,
  args: RouteChartActionArgs,
): Promise<string> {
  const payload: Record<string, unknown> = { ...(args.payload ?? {}) };
  if (args.indicators?.length) {
    payload.indicators = args.indicators;
    payload.enable = args.enable !== false;
  }

  const { id, href } = await queueChartAction(supabase, userId, {
    actionType: args.action_type,
    symbol: args.symbol,
    timeframe: args.timeframe,
    accountId: args.account_id,
    payload,
  });

  const label = args.label ?? "Open chart";
  return (
    `Chart action queued (${args.action_type} on ${args.symbol.toUpperCase()}). ` +
    `The chart will apply it on open — anchors stay adjustable. ` +
    `Render this as a button: [[link:${href}|${label}]] ` +
    `(queue id: ${id})`
  );
}

export async function handlePrepareExecutionRequest(
  supabase: SupabaseClient,
  userId: string,
  args: PrepareExecutionArgs,
  firePush?: (title: string, body: string, url: string) => void,
): Promise<string> {
  const prefs = await getTradeExecutionPrefsForUser(userId);
  const volume =
    args.volume != null && Number.isFinite(Number(args.volume))
      ? normalizeTradeVolume(Number(args.volume))
      : prefs.defaultVolume;
  const { id, href } = await createExecutionRequest(supabase, userId, { ...args, volume });
  const title = `Trade ready: ${args.instrument}`;
  const body = `${args.direction.toUpperCase()} ${volume.toFixed(2)} lots @ ${args.entry_price ?? "market"} — review and approve`;
  firePush?.(`AXE · ${title}`, body, href);
  return (
    `Execution request drafted (id: ${id}). Status: pending your approval on /actions. ` +
    `Size ${volume.toFixed(2)} lots · entry ${args.entry_price ?? "—"}, SL ${args.stop_loss ?? "—"}, TP ${args.take_profit ?? "—"}. ` +
    `Render this as a button: [[link:${href}|Review trade]]`
  );
}
