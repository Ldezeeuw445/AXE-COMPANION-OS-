import { createServerSupabaseClient } from "@/lib/supabase/server";

export type JournalEntryRow = {
  id: string;
  symbol: string;
  notes: string;
  rating: string | null;
  tags: unknown;
  created_at: string;
};

export type TradeHighlight = {
  id: string;
  symbol: string;
  side: string;
  pnl: number;
  close_time: string | null;
  label: string | null;
  note: string | null;
};

export type JournalPageData = {
  entries: JournalEntryRow[];
  tradeHighlight: TradeHighlight | null;
  loadError: string | null;
};

export async function loadJournalPageData(opts: {
  tradeId?: string | null;
  accountId?: string | null;
}): Promise<JournalPageData> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { entries: [], tradeHighlight: null, loadError: "Supabase is not configured." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { entries: [], tradeHighlight: null, loadError: "Not signed in." };
  }

  const jRes = await supabase
    .from("user_journal_entries")
    .select("id,symbol,notes,rating,tags,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(40);

  if (jRes.error) {
    return { entries: [], tradeHighlight: null, loadError: jRes.error.message };
  }

  const entries = (jRes.data ?? []) as JournalEntryRow[];
  let tradeHighlight: TradeHighlight | null = null;

  const tid = opts.tradeId?.trim();
  const aid = opts.accountId?.trim();
  if (tid && aid) {
    const { data: tr, error: te } = await supabase
      .from("broker_trades")
      .select("id,symbol,side,pnl,close_time")
      .eq("user_id", user.id)
      .eq("account_id", aid)
      .eq("id", tid)
      .maybeSingle();

    if (!te && tr) {
      const { data: lbl } = await supabase
        .from("trade_journal_labels")
        .select("label,note")
        .eq("user_id", user.id)
        .eq("trade_id", tid)
        .maybeSingle();

      tradeHighlight = {
        id: tr.id as string,
        symbol: tr.symbol as string,
        side: tr.side as string,
        pnl: Number(tr.pnl ?? 0) || 0,
        close_time: (tr.close_time as string | null) ?? null,
        label: (lbl?.label as string | undefined) ?? null,
        note: (lbl?.note as string | undefined) ?? null,
      };
    }
  }

  return { entries, tradeHighlight, loadError: null };
}
