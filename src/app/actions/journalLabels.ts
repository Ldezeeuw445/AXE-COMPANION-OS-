"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isJournalTradeTag } from "@/lib/journal/tradeTags";

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

  revalidatePath("/journal");
  revalidatePath("/history");
  revalidatePath("/chat");
  return { ok: true };
}
