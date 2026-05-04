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
