import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeTradeVolume } from "@/lib/trading/tradeVolume";

export type PrepareExecutionArgs = {
  instrument: string;
  symbol?: string;
  direction: "long" | "short";
  entry_price?: number;
  stop_loss?: number;
  take_profit?: number;
  risk_percent?: number;
  risk_amount?: number;
  volume?: number;
  rationale: string;
  notes?: string;
};

export async function createExecutionRequest(
  supabase: SupabaseClient,
  userId: string,
  args: PrepareExecutionArgs,
): Promise<{ id: string; href: string }> {
  const instrument = args.instrument.trim().toUpperCase();
  const symbol = (args.symbol ?? instrument).trim().toUpperCase();

  const { data, error } = await supabase
    .from("execution_requests")
    .insert({
      user_id: userId,
      instrument,
      symbol,
      direction: args.direction,
      entry_price: args.entry_price ?? null,
      stop_loss: args.stop_loss ?? null,
      take_profit: args.take_profit ?? null,
      risk_percent: args.risk_percent ?? null,
      risk_amount: args.risk_amount ?? null,
      volume_lots: args.volume != null ? normalizeTradeVolume(args.volume) : null,
      rationale: args.rationale,
      notes: args.notes ?? null,
      status: "pending",
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create execution request");
  }

  return { id: data.id, href: "/actions" };
}
