import { PositionsScreen } from "@/components/positions/PositionsScreen";
import { loadPositionsPageData } from "@/lib/broker/loadPositionsPageData";

export default async function PositionsPage() {
  const data = await loadPositionsPageData();
  return (
    <PositionsScreen
      positions={data.positions}
      pendingOrders={data.pendingOrders}
      accountSummary={data.accountSummary}
      providerStatus={data.providerStatus}
      error={data.error}
      hint={data.hint}
    />
  );
}
