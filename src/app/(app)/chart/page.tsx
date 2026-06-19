import { Suspense } from "react";
import { ChartScreen } from "@/components/chart/ChartScreen";
import { ChartCacheFallback } from "@/components/chart/ChartCacheFallback";
import { loadChartPageData } from "@/lib/broker/loadChartPageData";
import { getLiveTradingServerState } from "@/lib/liveTrading/serverFlag";
import { getInstantSlTpModifyServerState } from "@/lib/chart/serverSlTpPrefs";
import { detectActionRuntime, buildWorkflowRuntime } from "@/lib/workflows/runtime";
import { getFavoriteWorkflowIdsServerState } from "@/lib/workflows/serverFavorites";
import {
  getEodhdKey,
  getFinnhubKey,
  getFredKey,
  getPerigonKey,
} from "@/lib/market/providerStatus";

type PageProps = {
  searchParams: Promise<{ symbol?: string; tf?: string; account?: string; action?: string }>;
};

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
  const [data, liveTrading, instantSlTpModify, runtime, favoriteWorkflowIds] = await Promise.all([
    loadChartPageData(symbol, tf, account),
    getLiveTradingServerState(),
    getInstantSlTpModifyServerState(),
    detectActionRuntime(),
    getFavoriteWorkflowIdsServerState(),
  ]);
  const hasNews = Boolean(getPerigonKey() || getFinnhubKey() || getEodhdKey());
  const hasMacro = Boolean(getFredKey()) || hasNews;
  const workflowRuntime = buildWorkflowRuntime(runtime, hasNews, hasMacro);

  return (
    <ChartScreen
      data={data}
      initialAction={action}
      liveTradingEnabled={liveTrading.enabled}
      instantSlTpModify={instantSlTpModify}
      favoriteWorkflowIds={favoriteWorkflowIds}
      workflowRuntime={workflowRuntime}
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
