import { createServerSupabaseClient } from "@/lib/supabase/server";
import { computeJournalAnalytics, type JournalAnalytics } from "@/lib/journal/computeJournalAnalytics";
import { syncAccountIfStale } from "@/lib/mt5/backgroundSync";
import { detectWeakSpots, type WeakSpot } from "@/lib/journal/weakSpots";
import { loadWeakSpotTrades } from "@/services/weakSpotService";
import { getLearningGrowth } from "@/services/learningGrowthService";
import type { LearningStage } from "@/lib/axe/learningStage";

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
  volume: number;
  open_price: number | null;
  close_price: number | null;
  open_time: string | null;
  pnl: number;
  fees: number;
  close_time: string | null;
  label: string | null;
  note: string | null;
  /** AXE Core auto-generated tag (null until AXE scores the trade) */
  axe_label: string | null;
  /** AXE Core reasoning for the tag */
  axe_note: string | null;
  /** AXE alignment score 0-100 (null until scored) */
  alignment_score: number | null;
  /**
   * AXE full journal breakdown. A dimension is null when AXE had nothing to
   * judge it against — no stated playbook, no stated rules — and the badge
   * says so rather than drawing an empty bar out of 25.
   */
  axe_journal: {
    rule_adherence: number | null;
    playbook_alignment: number | null;
    risk_management: number | null;
    emotional_discipline: number | null;
    explanation: string;
  } | null;
};

export type JournalPageData = {
  entries: JournalEntryRow[];
  tradeHighlight: TradeHighlight | null;
  /** Active account: recent closed trades + labels for inline journaling */
  journalTrades: TradeHighlight[];
  analytics: JournalAnalytics | null;
  /** Patterns AXE spotted by itself — what most often goes wrong, with a fix. */
  weakSpots: WeakSpot[];
  /** How much AXE knows about this trader, and whether that is still growing. */
  learningArc: LearningStage | null;
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
    weakSpots: [],
    learningArc: null,
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
  let weakSpots: WeakSpot[] = [];
  // Outside the activeAccountId branch on purpose: the arc counts rules,
  // playbooks and memories, which exist whether or not a broker is linked.
  const learningArc = await getLearningGrowth(sb, userId, "axe");

  if (activeAccountId) {
    void syncAccountIfStale(sb, userId, activeAccountId).catch(() => undefined);
  }

  let tradeHighlight: TradeHighlight | null = null;
  const journalTrades: TradeHighlight[] = [];

  const tid = opts.tradeId?.trim();
  const aid = opts.accountId?.trim();

  async function buildHighlight(tradeId: string, accountId: string): Promise<TradeHighlight | null> {
    const { data: tr, error: te } = await sb
      .from("broker_trades")
      .select("id,symbol,side,volume,open_time,close_time,open_price,close_price,pnl,fees")
      .eq("user_id", userId)
      .eq("account_id", accountId)
      .eq("id", tradeId)
      .maybeSingle();

    if (te || !tr) return null;

    const { data: lbl } = await sb
      .from("trade_journal_labels")
      .select("label,note,axe_label,axe_note,alignment_score,axe_journal")
      .eq("user_id", userId)
      .eq("trade_id", tradeId)
      .maybeSingle();

    return {
      id: tr.id as string,
      accountId,
      symbol: tr.symbol as string,
      side: tr.side as string,
      volume: Number(tr.volume ?? 0) || 0,
      open_price: tr.open_price != null ? Number(tr.open_price) : null,
      close_price: tr.close_price != null ? Number(tr.close_price) : null,
      open_time: (tr.open_time as string | null) ?? null,
      pnl: Number(tr.pnl ?? 0) || 0,
      fees: Number(tr.fees ?? 0) || 0,
      close_time: (tr.close_time as string | null) ?? null,
      label: (lbl?.label as string | undefined) ?? null,
      note: (lbl?.note as string | undefined) ?? null,
      axe_label: (lbl?.axe_label as string | undefined) ?? null,
      axe_note: (lbl?.axe_note as string | undefined) ?? null,
      alignment_score: (lbl?.alignment_score as number | undefined) ?? null,
      axe_journal: (lbl?.axe_journal as TradeHighlight["axe_journal"]) ?? null,
    };
  }

  if (tid && aid) {
    tradeHighlight = await buildHighlight(tid, aid);
  }

  let analytics: JournalAnalytics | null = null;

  if (activeAccountId) {
    const { data: tradeRows, error: trErr } = await sb
      .from("broker_trades")
      .select("id,symbol,side,volume,open_time,close_time,open_price,close_price,pnl,fees")
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
        weakSpots: [],
        learningArc: null,
        activeAccountId,
        loadError: trErr.message,
      };
    }

    const rows = tradeRows ?? [];
    const ids = rows.map((r) => r.id as string);
    const labelByTrade = new Map<string, {
      label: string | null;
      note: string | null;
      axe_label: string | null;
      axe_note: string | null;
      alignment_score: number | null;
      axe_journal: TradeHighlight["axe_journal"];
    }>();

    if (ids.length > 0) {
      const { data: labRows } = await sb
        .from("trade_journal_labels")
        .select("trade_id,label,note,axe_label,axe_note,alignment_score,axe_journal")
        .eq("user_id", userId)
        .in("trade_id", ids);

      for (const row of labRows ?? []) {
        const r = row as {
          trade_id: string;
          label: string | null;
          note: string | null;
          axe_label: string | null;
          axe_note: string | null;
          alignment_score: number | null;
          axe_journal: TradeHighlight["axe_journal"];
        };
        labelByTrade.set(r.trade_id, {
          label: r.label,
          note: r.note,
          axe_label: r.axe_label,
          axe_note: r.axe_note,
          alignment_score: r.alignment_score,
          axe_journal: r.axe_journal,
        });
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
        volume: Number(tr.volume ?? 0) || 0,
        open_price: tr.open_price != null ? Number(tr.open_price) : null,
        close_price: tr.close_price != null ? Number(tr.close_price) : null,
        open_time: (tr.open_time as string | null) ?? null,
        pnl: Number(tr.pnl ?? 0) || 0,
        fees: Number(tr.fees ?? 0) || 0,
        close_time: (tr.close_time as string | null) ?? null,
        label: lb?.label ?? null,
        note: lb?.note ?? null,
        axe_label: lb?.axe_label ?? null,
        axe_note: lb?.axe_note ?? null,
        alignment_score: lb?.alignment_score ?? null,
        axe_journal: lb?.axe_journal ?? null,
      });
    }

    analytics = computeJournalAnalytics(
      journalTrades.map((t) => ({ pnl: t.pnl, fees: t.fees, label: t.label })),
    );

    // Weak spots need volume and open times, which TradeHighlight does not
    // carry, so they are read separately rather than widening that type for
    // every consumer.
    weakSpots = detectWeakSpots(await loadWeakSpotTrades(sb, userId, activeAccountId));
  }

  return {
    entries,
    tradeHighlight,
    journalTrades,
    analytics,
    weakSpots,
    learningArc,
    activeAccountId,
    loadError: null,
  };
}
