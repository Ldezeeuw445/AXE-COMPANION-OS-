import { TradingTeamRunsPanel } from "@/components/tradingTeam/TradingTeamRunsPanel";

export const dynamic = "force-dynamic";

export default function TradingTeamPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <TradingTeamRunsPanel />
    </div>
  );
}
