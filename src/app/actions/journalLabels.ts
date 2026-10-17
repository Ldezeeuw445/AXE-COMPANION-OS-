"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { saveTradeJournalLabel } from "@/lib/journal/saveTradeJournalLabel";

export type SaveTradeLabelResult = { ok?: true; error?: string };

export async function upsertTradeJournalLabelAction(
  _prev: SaveTradeLabelResult | undefined,
  formData: FormData,
): Promise<SaveTradeLabelResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase is not configured." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const result = await saveTradeJournalLabel(supabase, user.id, {
    tradeId: String(formData.get("tradeId") ?? ""),
    accountId: String(formData.get("accountId") ?? ""),
    label: String(formData.get("label") ?? "") || null,
    note: String(formData.get("note") ?? "") || null,
  });

  if (!result.ok) return { error: result.error };

  revalidatePath("/journal");
  revalidatePath("/history");
  revalidatePath("/chat");
  return { ok: true };
}

/* ── AXE auto-tagging ──────────────────────────────────────────── */

export type AxeTagResult = { ok?: true; error?: string };

/**
 * Save an AXE-generated tag + note for a trade.
 * Called by AXE Core (via API route or chat action) — NOT by the user form.
 * Uses separate `axe_label` and `axe_note` columns so user and AI tags coexist.
 */
export async function upsertAxeTradeLabel(
  tradeId: string,
  accountId: string,
  axeLabel: string,
  axeNote: string | null,
): Promise<AxeTagResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase is not configured." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  if (!tradeId || !accountId) return { error: "Missing trade or account." };
  if (!axeLabel.trim()) return { error: "AXE label is empty." };

  const { data: tr, error: trErr } = await supabase
    .from("broker_trades")
    .select("id")
    .eq("user_id", user.id)
    .eq("account_id", accountId)
    .eq("id", tradeId)
    .maybeSingle();

  if (trErr) return { error: trErr.message };
  if (!tr) return { error: "Trade not found for this account." };

  const { data: existing, error: exErr } = await supabase
    .from("trade_journal_labels")
    .select("trade_id")
    .eq("user_id", user.id)
    .eq("trade_id", tradeId)
    .maybeSingle();

  if (exErr) return { error: exErr.message };

  if (existing?.trade_id) {
    const { error: upErr } = await supabase
      .from("trade_journal_labels")
      .update({ axe_label: axeLabel.trim(), axe_note: axeNote?.trim() || null })
      .eq("user_id", user.id)
      .eq("trade_id", tradeId);
    if (upErr) return { error: upErr.message };
  } else {
    const { error: inErr } = await supabase
      .from("trade_journal_labels")
      .insert({
        user_id: user.id,
        trade_id: tradeId,
        account_id: accountId,
        axe_label: axeLabel.trim(),
        axe_note: axeNote?.trim() || null,
      });
    if (inErr) return { error: inErr.message };
  }

  revalidatePath("/journal");
  return { ok: true };
}
