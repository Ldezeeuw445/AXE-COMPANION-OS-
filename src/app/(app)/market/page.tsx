import Link from "next/link";
import { Sparkles } from "lucide-react";
import { ScreenHeader } from "@/components/shell/ScreenHeader";
import { GlassPanel } from "@/components/ui/GlassPanel";

export default function MarketContextPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 pb-2">
      <ScreenHeader
        title="Market context"
        subtitle="Macro (FRED) and curated news flow into AXE when providers are connected — filtered by your active pair and watchlist."
        left={<Sparkles className="h-6 w-6 text-cyan-400/80" aria-hidden />}
      />
      <GlassPanel className="p-4 text-sm leading-relaxed text-tos-muted">
        <p>
          Market context is not fully wired in this build yet. When FRED and your news engine are connected, AXE will
          prioritise high-impact USD events, gold-sensitive macro for XAUUSD, and crypto headlines for BTCUSD based on
          your watchlist and open positions.
        </p>
        <p className="mt-3 text-xs text-tos-dim">
          You can still ask AXE in{" "}
          <Link href="/chat" className="text-cyan-400 hover:underline">
            Chat
          </Link>{" "}
          — responses use whatever context providers return, without inventing live headlines.
        </p>
      </GlassPanel>
    </div>
  );
}
