import { ChartScreen } from "@/components/chart/ChartScreen";
import { loadChartPageData } from "@/lib/broker/loadChartPageData";
import { getLiveTradingServerState } from "@/lib/liveTrading/serverFlag";

type PageProps = {
  searchParams: Promise<{ symbol?: string; tf?: string; account?: string; action?: string }>;
};

export default async function ChartPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const [data, liveTrading] = await Promise.all([
    loadChartPageData(sp.symbol, sp.tf, sp.account),
    getLiveTradingServerState(),
  ]);
  return (
    <ChartScreen
      data={data}
      initialAction={sp.action}
      liveTradingEnabled={liveTrading.enabled}
    />
  );
}
