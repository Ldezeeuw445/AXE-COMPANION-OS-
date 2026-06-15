import type { SupabaseClient } from "@supabase/supabase-js";
import { getAlpacaPaperConfig } from "@/lib/alpaca/env";
import { cancelAllAlpacaOrders, closeAllAlpacaPositions } from "@/lib/alpaca/client";

export type AlpacaResetResult =
  | { ok: true; message: string }
  | { ok: false; code: string; message: string };

/**
 * Reset a user's Alpaca paper trading state as far as the API allows.
 *
 * Alpaca no longer exposes a full balance reset endpoint — we cancel all
 * orders and flatten positions. For a fresh $100k balance, create a new
 * paper account in the Alpaca dashboard (Phase 2: Broker API sub-accounts).
 */
export async function resetAlpacaPaperTrading(
  _supabase: SupabaseClient,
  _userId: string,
  _brokerAccountId: string,
): Promise<AlpacaResetResult> {
  const config = getAlpacaPaperConfig();
  if (!config) {
    return {
      ok: false,
      code: "alpaca_not_configured",
      message: "Alpaca paper credentials are not configured on the server.",
    };
  }

  try {
    await cancelAllAlpacaOrders(config);
    await closeAllAlpacaPositions(config);
    return {
      ok: true,
      message:
        "All Alpaca paper orders cancelled and positions closed. Balance history remains until you open a new paper account in Alpaca.",
    };
  } catch (error) {
    return {
      ok: false,
      code: "reset_failed",
      message: error instanceof Error ? error.message : "Alpaca reset failed.",
    };
  }
}
