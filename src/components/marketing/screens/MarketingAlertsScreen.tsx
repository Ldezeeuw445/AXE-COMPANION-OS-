import { GlassPanel } from "@/components/ui/GlassPanel";
import { Badge } from "@/components/ui/Badge";
import { MarketingStatusBar } from "@/components/marketing/MarketingStatusBar";
import { marketingAlerts } from "@/services/mock/marketingVisualData";

function alertBadge(tone: "neutral" | "risk" | "news") {
  if (tone === "risk") return <Badge variant="risk">Risk</Badge>;
  if (tone === "news") return <Badge variant="news">News</Badge>;
  return <Badge variant="price">Price</Badge>;
}

export function MarketingAlertsScreen() {
  return (
    <div className="flex h-[780px] flex-col bg-tos-bg">
      <MarketingStatusBar />
      <div className="flex flex-1 flex-col gap-3 px-4 pb-6">
        <header className="pt-1">
          <h2 className="text-base font-bold tracking-tight text-tos-text">
            Alerts
          </h2>
          <p className="text-[11px] text-tos-muted">Terminal → companion</p>
        </header>

        <div className="flex gap-2">
          {(["All", "Price", "Risk", "News"] as const).map((f, i) => (
            <span
              key={f}
              className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${
                i === 0
                  ? "border-tos-warm/35 bg-tos-warm-soft/25 text-tos-warm"
                  : "border-tos-border text-tos-dim"
              }`}
            >
              {f}
            </span>
          ))}
        </div>

        <div className="flex flex-col gap-2.5">
          {marketingAlerts.map((a) => (
            <GlassPanel key={a.id} className="p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                {alertBadge(a.tone)}
                {a.unread ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-tos-warm" />
                ) : null}
                <span className="ml-auto font-mono text-[9px] text-tos-dim">{a.time}</span>
              </div>
              <h3 className="mt-2 text-[13px] font-medium leading-snug text-tos-text">
                {a.title}
              </h3>
              <p className="mt-1 text-[12px] leading-relaxed text-tos-muted">{a.body}</p>
            </GlassPanel>
          ))}
        </div>
      </div>
    </div>
  );
}
