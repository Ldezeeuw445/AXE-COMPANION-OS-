import { isJournalTradeTag, type JournalTradeTag } from "@/lib/journal/tradeTags";

export type AxeJournalLabelRow = {
  user_id: string;
  trade_id: string;
  account_id: string;
  /** Manual tag column — NOT NULL in production, so AXE must populate it. */
  label: JournalTradeTag;
  axe_label: string;
  axe_note: string;
  alignment_score: number;
  axe_journal: unknown;
};

/**
 * Row written when AXE journals a trade by itself.
 *
 * Production `trade_journal_labels.label` is NOT NULL with no default. The
 * sweep and post-sync journaler used to insert only `axe_label`, so Postgres
 * rejected every row, the error was ignored, and `axe_engine_runs` still
 * recorded success. Copying the AXE tag into `label` is what makes the write
 * actually land. The CHECK constraint already allows these six values.
 */
export function buildAxeJournalLabelRow(input: {
  userId: string;
  tradeId: string;
  accountId: string;
  axeLabel: string;
  axeNote: string;
  alignmentScore: number;
  breakdown: unknown;
}): AxeJournalLabelRow {
  const label: JournalTradeTag = isJournalTradeTag(input.axeLabel) ? input.axeLabel : "OK";
  return {
    user_id: input.userId,
    trade_id: input.tradeId,
    account_id: input.accountId,
    label,
    axe_label: label,
    axe_note: String(input.axeNote ?? "").slice(0, 500),
    alignment_score: input.alignmentScore,
    axe_journal: input.breakdown ?? null,
  };
}
