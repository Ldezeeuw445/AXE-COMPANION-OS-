import type { SupabaseClient } from "@supabase/supabase-js";
import { isJournalTradeTag } from "@/lib/journal/tradeTags";
import { recordLearningSignal } from "@/services/learningService";

export type SaveTradeJournalLabelInput = {
  tradeId: string;
  accountId: string;
  label: string | null;
  note: string | null;
};

export type SaveTradeJournalLabelResult =
  | { ok: true }
  | { ok: false; error: string; status: number };

export async function saveTradeJournalLabel(
  supabase: SupabaseClient,
  userId: string,
  input: SaveTradeJournalLabelInput,
): Promise<SaveTradeJournalLabelResult> {
  const tradeId = input.tradeId.trim();
  const accountId = input.accountId.trim();
  const labelRaw = (input.label ?? "").trim();
  const note = (input.note ?? "").trim();

  if (!tradeId || !accountId) return { ok: false, error: "Missing trade or account.", status: 400 };
  if (!labelRaw && !note) {
    return { ok: false, error: "Choose a preset tag and/or add a note.", status: 400 };
  }
  if (labelRaw && !isJournalTradeTag(labelRaw)) {
    return {
      ok: false,
      error: "Use one of the preset tags (Perfect, Good, OK, Impatient, Poor, Emotional).",
      status: 400,
    };
  }

  const { data: tr, error: trErr } = await supabase
    .from("broker_trades")
    .select("id")
    .eq("user_id", userId)
    .eq("account_id", accountId)
    .eq("id", tradeId)
    .maybeSingle();

  if (trErr) return { ok: false, error: trErr.message, status: 500 };
  if (!tr) return { ok: false, error: "Trade not found for this account.", status: 404 };

  const { data: existing, error: exErr } = await supabase
    .from("trade_journal_labels")
    .select("trade_id")
    .eq("user_id", userId)
    .eq("trade_id", tradeId)
    .maybeSingle();

  if (exErr) return { ok: false, error: exErr.message, status: 500 };

  const payload = {
    user_id: userId,
    trade_id: tradeId,
    account_id: accountId,
    label: labelRaw || null,
    note: note || null,
  };

  if (existing?.trade_id) {
    const { error: upErr } = await supabase
      .from("trade_journal_labels")
      .update({ label: payload.label, note: payload.note })
      .eq("user_id", userId)
      .eq("trade_id", tradeId);
    if (upErr) return { ok: false, error: upErr.message, status: 500 };
  } else {
    const { error: inErr } = await supabase.from("trade_journal_labels").insert(payload);
    if (inErr) return { ok: false, error: inErr.message, status: 500 };
  }

  if (payload.label) {
    await recordLearningSignal(supabase, userId, "journal_label", {
      trade_id: tradeId,
      label: payload.label,
      has_note: Boolean(payload.note),
    });
  }

  return { ok: true };
}
