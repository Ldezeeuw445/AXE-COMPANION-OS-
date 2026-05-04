import { JOURNAL_TRADE_TAGS } from "@/lib/journal/tradeTags";

export type JournalTradeForAnalytics = {
  pnl: number;
  label: string | null;
};

export type JournalAnalytics = {
  totalTrades: number;
  journaledWithTagCount: number;
  completionPct: number;
  consistencyScorePct: number;
  topTagAllTime: string | null;
  topTagAllTimeCount: number;
  mostCommonLosingTag: string | null;
  bestPerformingTag: string | null;
  bestPerformingTagAvgPnl: number | null;
  avgPnlWhenImpatient: number | null;
  impatientCount: number;
  tagDistribution: { tag: string; count: number }[];
};

function isPresetLabel(l: string | null | undefined): l is string {
  if (!l || !l.trim()) return false;
  return (JOURNAL_TRADE_TAGS as readonly string[]).includes(l.trim());
}

export function computeJournalAnalytics(trades: JournalTradeForAnalytics[]): JournalAnalytics {
  const totalTrades = trades.length;
  const journaledWithTagCount = trades.filter((t) => isPresetLabel(t.label)).length;
  const completionPct =
    totalTrades > 0 ? Math.round((journaledWithTagCount / totalTrades) * 100) : 0;
  const consistencyScorePct = completionPct;

  const presetCounts = new Map<string, number>();
  for (const tag of JOURNAL_TRADE_TAGS) presetCounts.set(tag, 0);
  for (const t of trades) {
    if (isPresetLabel(t.label)) {
      const k = t.label!.trim();
      presetCounts.set(k, (presetCounts.get(k) ?? 0) + 1);
    }
  }

  let topTagAllTime: string | null = null;
  let topTagAllTimeCount = 0;
  for (const [tag, c] of presetCounts) {
    if (c > topTagAllTimeCount) {
      topTagAllTimeCount = c;
      topTagAllTime = tag;
    }
  }

  const losers = trades.filter((t) => t.pnl < 0 && isPresetLabel(t.label));
  const loseByTag = new Map<string, number>();
  for (const t of losers) {
    const k = t.label!.trim();
    loseByTag.set(k, (loseByTag.get(k) ?? 0) + 1);
  }
  let mostCommonLosingTag: string | null = null;
  let loseMax = 0;
  for (const [tag, c] of loseByTag) {
    if (c > loseMax) {
      loseMax = c;
      mostCommonLosingTag = tag;
    }
  }

  let bestPerformingTag: string | null = null;
  let bestPerformingTagAvgPnl: number | null = null;
  for (const tag of JOURNAL_TRADE_TAGS) {
    const subset = trades.filter((t) => t.label?.trim() === tag);
    if (subset.length === 0) continue;
    const avg = subset.reduce((a, t) => a + t.pnl, 0) / subset.length;
    if (bestPerformingTagAvgPnl === null || avg > bestPerformingTagAvgPnl) {
      bestPerformingTagAvgPnl = avg;
      bestPerformingTag = tag;
    }
  }

  const impatient = trades.filter((t) => t.label?.trim() === "Impatient");
  const impatientCount = impatient.length;
  const avgPnlWhenImpatient =
    impatientCount > 0
      ? impatient.reduce((a, t) => a + t.pnl, 0) / impatientCount
      : null;

  const tagDistribution = JOURNAL_TRADE_TAGS.map((tag) => ({
    tag,
    count: presetCounts.get(tag) ?? 0,
  })).sort((a, b) => b.count - a.count);

  return {
    totalTrades,
    journaledWithTagCount,
    completionPct,
    consistencyScorePct,
    topTagAllTime,
    topTagAllTimeCount,
    mostCommonLosingTag,
    bestPerformingTag,
    bestPerformingTagAvgPnl,
    avgPnlWhenImpatient,
    impatientCount,
    tagDistribution,
  };
}
