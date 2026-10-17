import { Suspense } from "react";
import { ChartScreen } from "@/components/chart/ChartScreen";
import { ChartCacheFallback } from "@/components/chart/ChartCacheFallback";
import { loadChartPageData } from "@/lib/broker/loadChartPageData";
import { getLiveTradingServerState } from "@/lib/liveTrading/serverFlag";
import { getInstantSlTpModifyServerState } from "@/lib/chart/serverSlTpPrefs";
import { detectActionRuntime, buildWorkflowRuntime } from "@/lib/workflows/runtime";
import { getFavoriteWorkflowIdsServerState } from "@/lib/workflows/serverFavorites";
import { hasEntitlementFeature } from "@/lib/billing/access";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getUserAxeEntitlement } from "@/services/billingService";
import {
  getEodhdKey,
  getFinnhubKey,
  getFredKey,
  getPerigonKey,
} from "@/lib/market/providerStatus";
import { readActiveSessionCookie } from "@/lib/session/readActiveSession.server";
import { ActiveSessionSeed } from "@/components/session/ActiveSessionSeed";

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

  let canFullIndicators = false;
  const supabase = await createServerSupabaseClient();
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const ent = await getUserAxeEntitlement(supabase, user.id);
      canFullIndicators = hasEntitlementFeature(ent, "full_indicators", user.id);
    }
  }

  return (
    <>
      <ActiveSessionSeed
        symbol={data.symbol}
        timeframe={data.timeframeKey}
        accountId={data.account?.brokerAccountId ?? null}
        accountLabel={data.account?.label ?? null}
        lastTab="chart"
      />
      <ChartScreen
        data={data}
        initialAction={action}
        liveTradingEnabled={liveTrading.enabled}
        instantSlTpModify={instantSlTpModify}
        favoriteWorkflowIds={favoriteWorkflowIds}
        workflowRuntime={workflowRuntime}
        canFullIndicators={canFullIndicators}
      />
    </>
  );
}

export default async function ChartPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const session = await readActiveSessionCookie();
  const symbol = (sp.symbol ?? "").trim() || session.symbol;
  const tf = (sp.tf ?? "").trim() || session.timeframe;
  const account = (sp.account ?? "").trim() || session.accountId || undefined;
  return (
    <Suspense
      fallback={<ChartCacheFallback symbol={symbol} tf={tf} />}
    >
      <ChartData
        symbol={symbol}
        tf={tf}
        account={account}
        action={sp.action}
      />
    </Suspense>
  );
}
