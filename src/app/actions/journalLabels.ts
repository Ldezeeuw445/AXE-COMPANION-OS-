"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isJournalTradeTag } from "@/lib/journal/tradeTags";
import { recordLearningSignal } from "@/services/learningService";

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

  const tradeId = String(formData.get("tradeId") ?? "").trim();
  const accountId = String(formData.get("accountId") ?? "").trim();
  const labelRaw = String(formData.get("label") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (!tradeId || !accountId) return { error: "Missing trade or account." };
  if (!labelRaw && !note) return { error: "Choose a preset tag and/or add a note." };
  if (labelRaw && !isJournalTradeTag(labelRaw)) {
    return { error: "Use one of the preset tags (Perfect, Good, OK, Impatient, Poor, Emotional)." };
  }

  const label = labelRaw || null;

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

  const payload = {
    user_id: user.id,
    trade_id: tradeId,
    label,
    note: note || null,
  };

  if (existing?.trade_id) {
    const { error: upErr } = await supabase
      .from("trade_journal_labels")
      .update({ label: payload.label, note: payload.note })
      .eq("user_id", user.id)
      .eq("trade_id", tradeId);
    if (upErr) return { error: upErr.message };
  } else {
    const { error: inErr } = await supabase.from("trade_journal_labels").insert(payload);
    if (inErr) return { error: inErr.message };
  }

  // Record a behavioral learning signal so the cockpit alignment score reflects
  // the trader's own assessment of their trades (not just a GPT guess).
  if (label) {
    await recordLearningSignal(supabase, user.id, "journal_label", {
      trade_id: tradeId,
      label,
      has_note: Boolean(note),
    });
  }

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

  // Verify the trade belongs to this user
  const { data: tr, error: trErr } = await supabase
    .from("broker_trades")
    .select("id")
    .eq("user_id", user.id)
    .eq("account_id", accountId)
    .eq("id", tradeId)
    .maybeSingle();

  if (trErr) return { error: trErr.message };
  if (!tr) return { error: "Trade not found for this account." };

  // Check if row already exists
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
        axe_label: axeLabel.trim(),
        axe_note: axeNote?.trim() || null,
      });
    if (inErr) return { error: inErr.message };
  }

  revalidatePath("/journal");
  return { ok: true };
}
