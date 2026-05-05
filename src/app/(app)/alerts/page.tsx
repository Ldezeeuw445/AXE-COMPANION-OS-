import { AlertsClient } from "@/app/(app)/alerts/AlertsClient";

type PageProps = {
  searchParams: Promise<{ symbol?: string }>;
};

export default async function AlertsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const symbol = (sp.symbol ?? "").trim().toUpperCase();
  return <AlertsClient initialSymbol={symbol} />;
}
