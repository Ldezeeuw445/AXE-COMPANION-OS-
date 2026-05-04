import { JournalScreen } from "@/components/journal/JournalScreen";
import { loadJournalPageData } from "@/lib/journal/loadJournalPageData";

type PageProps = {
  searchParams: Promise<{ trade?: string; account?: string }>;
};

export default async function JournalPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const data = await loadJournalPageData({
    tradeId: sp.trade ?? null,
    accountId: sp.account ?? null,
  });

  return (
    <JournalScreen
      entries={data.entries}
      tradeHighlight={data.tradeHighlight}
      journalTrades={data.journalTrades}
      analytics={data.analytics}
      activeAccountId={data.activeAccountId}
      loadError={data.loadError}
    />
  );
}
