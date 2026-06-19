import { AlertsClient } from "@/app/(app)/alerts/AlertsClient";
import { getTradeExecutionPrefsServerState } from "@/lib/trading/serverTradePrefs";

type PageProps = {
  searchParams: Promise<{ symbol?: string }>;
};

export default async function AlertsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const symbol = (sp.symbol ?? "").trim().toUpperCase();
  const tradePrefs = await getTradeExecutionPrefsServerState();
  return <AlertsClient initialSymbol={symbol} tradePrefs={tradePrefs} />;
}
