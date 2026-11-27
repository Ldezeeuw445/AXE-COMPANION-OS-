import type { Metadata } from "next";
import { CockpitLearningModel } from "@/components/cockpit/CockpitLearningModel";
import {
  computeLearningState,
  learningChanges,
  learningHistory,
  type LearningInput,
  type LearningTrade,
} from "@/lib/axe/learningModel";

export const metadata: Metadata = {
  title: "Learning model probe",
  robots: { index: false, follow: false },
};

/**
 * Screenshot probe for the learning model card. SYNTHETIC data only — built
 * here from a fixed clock so the screenshots are reproducible. Not a user.
 */
const NOW = Date.parse("2026-11-27T12:00:00Z");
const DAY = 86_400_000;

function synthetic(kind: "learning" | "scored"): LearningInput {
  const trades: LearningTrade[] = [];
  const n = kind === "learning" ? 9 : 46;
  for (let i = 0; i < n; i += 1) {
    const daysAgo = kind === "learning" ? 1 + i : 1 + Math.floor(i * 1.9);
    const d = new Date(NOW - daysAgo * DAY);
    d.setUTCHours(i % 4 === 0 ? 14 : 8, 15, 0, 0);
    trades.push({
      id: `p${i}`,
      accountId: i % 3 === 0 ? "acc-b" : "acc-a",
      symbol: i % 5 === 0 ? "BTCUSD" : i % 11 === 0 ? "AUDUSD" : "XAUUSD",
      openTime: d.toISOString(),
      closeTime: new Date(d.getTime() + 2 * 3600_000).toISOString(),
      pnl: i % 3 === 0 ? -120 - (i === 9 ? 500 : 0) : 180,
    });
  }
  const labels = trades.map((t, i) => ({ tradeId: t.id, axeScore: 55 + ((i * 7) % 30) + (i < 12 ? 6 : 0) }));
  const votes = Array.from({ length: kind === "learning" ? 3 : 18 }, (_, i) => ({
    messageId: `m${i}`,
    rating: (i % 4 === 0 ? "down" : "up") as "up" | "down",
    at: new Date(NOW - (1 + i * 2) * DAY).toISOString(),
  }));
  return {
    trades,
    labels,
    votes,
    declaredSymbols: ["XAUUSD", "BTCUSD"],
    overrides:
      kind === "scored"
        ? [{ itemKey: "instrument:AUDUSD", action: "hide", createdAt: new Date(NOW - DAY).toISOString() }]
        : [],
    now: NOW,
  };
}

export default async function LearningProbePage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const { state: which } = await searchParams;
  const kind = which === "learning" ? "learning" : "scored";
  const input = synthetic(kind);
  const payload = {
    state: computeLearningState(input),
    changes: learningChanges(input),
    history: learningHistory(input),
    overridesAvailable: true,
  };
  return (
    <main className="min-h-screen bg-black p-4" data-testid="learning-probe">
      <div className="mx-auto max-w-[520px]">
        <CockpitLearningModel initial={payload} readOnly />
      </div>
    </main>
  );
}
