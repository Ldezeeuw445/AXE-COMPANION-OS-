/** Preset trade journal tags — keep in sync with UI and server validation. */
export const JOURNAL_TRADE_TAGS = [
  "Perfect",
  "Good",
  "OK",
  "Impatient",
  "Poor",
  "Emotional",
] as const;

export type JournalTradeTag = (typeof JOURNAL_TRADE_TAGS)[number];

export function isJournalTradeTag(s: string): s is JournalTradeTag {
  return (JOURNAL_TRADE_TAGS as readonly string[]).includes(s);
}

export const JOURNAL_TAG_COLORS: Record<JournalTradeTag, string> = {
  Perfect: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  Good: "bg-emerald-500/10 text-emerald-400/70 border-emerald-500/20",
  OK: "bg-white/[0.06] text-white/50 border-white/10",
  Impatient: "bg-amber-500/15 text-amber-400 border-amber-500/25",
  Poor: "bg-rose-500/10 text-rose-400/70 border-rose-500/20",
  Emotional: "bg-rose-500/20 text-rose-400 border-rose-500/30",
};
