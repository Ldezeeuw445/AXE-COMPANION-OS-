import { createServerSupabaseClient } from "@/lib/supabase/server";
import { computeJournalAnalytics, type JournalAnalytics } from "@/lib/journal/computeJournalAnalytics";

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
  accountId: string;
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
  /** Active account: recent closed trades + labels for inline journaling */
  journalTrades: TradeHighlight[];
  analytics: JournalAnalytics | null;
  activeAccountId: string | null;
  loadError: string | null;
};

const TRADE_PAGE_SIZE = 120;

export async function loadJournalPageData(opts: {
  tradeId?: string | null;
  accountId?: string | null;
}): Promise<JournalPageData> {
  const empty = (): JournalPageData => ({
    entries: [],
    tradeHighlight: null,
    journalTrades: [],
    analytics: null,
    activeAccountId: null,
    loadError: null,
  });

  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { ...empty(), loadError: "Supabase is not configured." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ...empty(), loadError: "Not signed in." };
  }

  const sb = supabase;
  const userId = user.id;

  const [jRes, prefsRes] = await Promise.all([
    supabase
      .from("user_journal_entries")
      .select("id,symbol,notes,rating,tags,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("user_workspace_preferences")
      .select("active_account_id")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (jRes.error) {
    return { ...empty(), loadError: jRes.error.message };
  }

  const entries = (jRes.data ?? []) as JournalEntryRow[];
  const activeAccountId = (prefsRes.data?.active_account_id as string | null | undefined) ?? null;

  let tradeHighlight: TradeHighlight | null = null;
  const journalTrades: TradeHighlight[] = [];

  const tid = opts.tradeId?.trim();
  const aid = opts.accountId?.trim();

  async function buildHighlight(tradeId: string, accountId: string): Promise<TradeHighlight | null> {
    const { data: tr, error: te } = await sb
      .from("broker_trades")
      .select("id,symbol,side,pnl,close_time")
      .eq("user_id", userId)
      .eq("account_id", accountId)
      .eq("id", tradeId)
      .maybeSingle();

    if (te || !tr) return null;

    const { data: lbl } = await sb
      .from("trade_journal_labels")
      .select("label,note")
      .eq("user_id", userId)
      .eq("trade_id", tradeId)
      .maybeSingle();

    return {
      id: tr.id as string,
      accountId,
      symbol: tr.symbol as string,
      side: tr.side as string,
      pnl: Number(tr.pnl ?? 0) || 0,
      close_time: (tr.close_time as string | null) ?? null,
      label: (lbl?.label as string | undefined) ?? null,
      note: (lbl?.note as string | undefined) ?? null,
    };
  }

  if (tid && aid) {
    tradeHighlight = await buildHighlight(tid, aid);
  }

  let analytics: JournalAnalytics | null = null;

  if (activeAccountId) {
    const { data: tradeRows, error: trErr } = await sb
      .from("broker_trades")
      .select("id,symbol,side,pnl,close_time")
      .eq("user_id", userId)
      .eq("account_id", activeAccountId)
      .order("close_time", { ascending: false, nullsFirst: false })
      .limit(TRADE_PAGE_SIZE);

    if (trErr) {
      return {
        entries,
        tradeHighlight,
        journalTrades: [],
        analytics: null,
        activeAccountId,
        loadError: trErr.message,
      };
    }

    const rows = tradeRows ?? [];
    const ids = rows.map((r) => r.id as string);
    const labelByTrade = new Map<string, { label: string | null; note: string | null }>();

    if (ids.length > 0) {
      const { data: labRows } = await sb
        .from("trade_journal_labels")
        .select("trade_id,label,note")
        .eq("user_id", userId)
        .in("trade_id", ids);

      for (const row of labRows ?? []) {
        const r = row as { trade_id: string; label: string | null; note: string | null };
        labelByTrade.set(r.trade_id, { label: r.label, note: r.note });
      }
    }

    for (const tr of rows) {
      const id = tr.id as string;
      const lb = labelByTrade.get(id);
      journalTrades.push({
        id,
        accountId: activeAccountId,
        symbol: String(tr.symbol ?? ""),
        side: String(tr.side ?? ""),
        pnl: Number(tr.pnl ?? 0) || 0,
        close_time: (tr.close_time as string | null) ?? null,
        label: lb?.label ?? null,
        note: lb?.note ?? null,
      });
    }

    analytics = computeJournalAnalytics(
      journalTrades.map((t) => ({ pnl: t.pnl, label: t.label })),
    );
  }

  return {
    entries,
    tradeHighlight,
    journalTrades,
    analytics,
    activeAccountId,
    loadError: null,
  };
}
