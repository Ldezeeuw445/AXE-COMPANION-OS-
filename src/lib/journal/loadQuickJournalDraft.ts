import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildQuickJournalDraft,
  type QuickJournalDraft,
  type QuickJournalTradeInput,
} from "@/lib/journal/quickJournalDraft";
import type { ActiveSessionState } from "@/lib/session/activeSession";

const TRADE_COLUMNS =
  "id,account_id,symbol,side,volume,open_time,close_time,open_price,close_price,pnl,fees";

type LabelRow = {
  label: string | null;
  note: string | null;
  axe_label: string | null;
  axe_note: string | null;
  alignment_score: number | null;
  axe_journal: { explanation?: string | null } | null;
};

function mapTrade(
  row: Record<string, unknown>,
  label: LabelRow | null,
): QuickJournalTradeInput {
  return {
    id: String(row.id),
    accountId: String(row.account_id),
    symbol: String(row.symbol ?? ""),
    side: String(row.side ?? ""),
    volume: Number(row.volume ?? 0) || 0,
    openPrice: row.open_price != null ? Number(row.open_price) : null,
    closePrice: row.close_price != null ? Number(row.close_price) : null,
    openTime: (row.open_time as string | null) ?? null,
    closeTime: (row.close_time as string | null) ?? null,
    pnl: Number(row.pnl ?? 0) || 0,
    fees: Number(row.fees ?? 0) || 0,
    label: label?.label ?? null,
    note: label?.note ?? null,
    axe_label: label?.axe_label ?? null,
    axe_note: label?.axe_note ?? null,
    alignment_score: label?.alignment_score ?? null,
    axe_journal: label?.axe_journal ?? null,
  };
}

async function loadLabel(
  supabase: SupabaseClient,
  userId: string,
  tradeId: string,
): Promise<LabelRow | null> {
  const { data } = await supabase
    .from("trade_journal_labels")
    .select("label,note,axe_label,axe_note,alignment_score,axe_journal")
    .eq("user_id", userId)
    .eq("trade_id", tradeId)
    .maybeSingle();
  return (data as LabelRow | null) ?? null;
}

export async function loadQuickJournalDraftByTrade(
  supabase: SupabaseClient,
  userId: string,
  tradeId: string,
  accountId: string,
  session?: Pick<ActiveSessionState, "accountId" | "accountLabel" | "accountType"> | null,
): Promise<QuickJournalDraft | null> {
  const { data, error } = await supabase
    .from("broker_trades")
    .select(TRADE_COLUMNS)
    .eq("user_id", userId)
    .eq("account_id", accountId)
    .eq("id", tradeId)
    .maybeSingle();
  if (error || !data) return null;
  const label = await loadLabel(supabase, userId, tradeId);
  return buildQuickJournalDraft(mapTrade(data as Record<string, unknown>, label), session);
}

export async function loadLastClosedQuickJournalDraft(
  supabase: SupabaseClient,
  userId: string,
  accountId: string,
  symbol?: string | null,
  session?: Pick<ActiveSessionState, "accountId" | "accountLabel" | "accountType"> | null,
): Promise<QuickJournalDraft | null> {
  let q = supabase
    .from("broker_trades")
    .select(TRADE_COLUMNS)
    .eq("user_id", userId)
    .eq("account_id", accountId)
    .not("close_time", "is", null)
    .order("close_time", { ascending: false })
    .limit(1);

  const sym = (symbol ?? "").trim().toUpperCase();
  if (sym) q = q.eq("symbol", sym);

  const { data, error } = await q.maybeSingle();
  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  const label = await loadLabel(supabase, userId, String(row.id));
  return buildQuickJournalDraft(mapTrade(row, label), session);
}
