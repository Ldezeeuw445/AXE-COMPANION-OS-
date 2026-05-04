import { ChartScreen } from "@/components/chart/ChartScreen";
import { loadChartPageData } from "@/lib/broker/loadChartPageData";

type PageProps = {
  searchParams: Promise<{ symbol?: string; tf?: string; account?: string }>;
};

export default async function ChartPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const data = await loadChartPageData(sp.symbol, sp.tf, sp.account);
  return <ChartScreen data={data} />;
}
