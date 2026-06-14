import { Suspense } from "react";
import { ChartScreen } from "@/components/chart/ChartScreen";
import { ChartCacheFallback } from "@/components/chart/ChartCacheFallback";
import { loadChartPageData } from "@/lib/broker/loadChartPageData";
import { getLiveTradingServerState } from "@/lib/liveTrading/serverFlag";
import { getInstantSlTpModifyServerState } from "@/lib/chart/serverSlTpPrefs";

type PageProps = {
  searchParams: Promise<{ symbol?: string; tf?: string; account?: string; action?: string }>;
};

/**
 * Server component that loads chart data and renders ChartScreen.
 * Wrapped in <Suspense> so the fallback shows cached candles immediately.
 */
async function ChartData({
  symbol,
  tf,
  account,
  action,
}: {
  symbol?: string;
  tf?: string;
  account?: string;
  action?: string;
}) {
  const [data, liveTrading, instantSlTpModify] = await Promise.all([
    loadChartPageData(symbol, tf, account),
    getLiveTradingServerState(),
    getInstantSlTpModifyServerState(),
  ]);
  return (
    <ChartScreen
      data={data}
      initialAction={action}
      liveTradingEnabled={liveTrading.enabled}
      instantSlTpModify={instantSlTpModify}
    />
  );
}

export default async function ChartPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  return (
    <Suspense
      fallback={<ChartCacheFallback symbol={sp.symbol} tf={sp.tf} />}
    >
      <ChartData
        symbol={sp.symbol}
        tf={sp.tf}
        account={sp.account}
        action={sp.action}
      />
    </Suspense>
  );
}
