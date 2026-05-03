import { HistoryScreen } from "@/components/history/HistoryScreen";
import {
  loadHistoryPageData,
  type HistorySearchParams,
} from "@/lib/broker/loadHistoryPageData";

type PageProps = {
  searchParams: Promise<HistorySearchParams>;
};

export default async function HistoryPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const data = await loadHistoryPageData(sp);

  return (
    <HistoryScreen
      accounts={data.accounts}
      activeAccountId={data.activeAccountId}
      selectedAccountId={data.selectedAccountId}
      trades={data.trades}
      summary={data.summary}
      filters={data.filters}
      loadError={data.error}
    />
  );
}
