import { ChartScreen } from "@/components/chart/ChartScreen";
import { loadChartPageData } from "@/lib/broker/loadChartPageData";

type PageProps = {
  searchParams: Promise<{ symbol?: string; tf?: string }>;
};

export default async function ChartPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const data = await loadChartPageData(sp.symbol, sp.tf);
  return <ChartScreen data={data} />;
}
