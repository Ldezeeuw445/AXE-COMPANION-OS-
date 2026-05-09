"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Toggle the long-term live-trading flag on the user's workspace preferences.
 *
 * The Settings panel calls this AFTER the disclaimer has been accepted on
 * the client (3 checkboxes + typed phrase). The server doesn't re-validate
 * the disclaimer text — flipping this to `true` is the user's signed-in
 * acknowledgment, not a security boundary. Real safety lives in the
 * per-order confirm modal + /api/mt5/order guards (auth, ownership,
 * non-demo, non-zero MetaApi token).
 */

export type ToggleLiveTradingResult =
  | { ok: true; enabled: boolean }
  | { ok: false; error: string };

export async function toggleLiveTradingEnabledAction(
  enable: boolean,
): Promise<ToggleLiveTradingResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { ok: false, error: "Supabase is not configured." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in to change live trading state." };

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("user_workspace_preferences")
    .upsert(
      {
        user_id: user.id,
        live_trading_enabled: enable,
        live_trading_enabled_at: enable ? now : null,
        updated_at: now,
      },
      { onConflict: "user_id" },
    );

  if (error) return { ok: false, error: error.message };

  // Both Settings and Chart read this flag server-side — refresh both routes.
  try {
    revalidatePath("/settings");
    revalidatePath("/chart");
  } catch {
    /* revalidatePath fails silently in some build/runtime combos — non-fatal */
  }

  return { ok: true, enabled: enable };
}
