import Image from "next/image";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Badge } from "@/components/ui/Badge";
import { MarketingStatusBar } from "@/components/marketing/MarketingStatusBar";
import {
  marketingOperator,
  marketingOverview,
} from "@/services/mock/marketingVisualData";

function MiniSparkline() {
  const pts = [46, 52, 49, 44, 48, 51, 50, 54, 53, 57];
  const w = 200;
  const h = 40;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const pad = 4;
  const path = pts
    .map((v, i) => {
      const x = pad + (i / (pts.length - 1)) * (w - pad * 2);
      const y = pad + (1 - (v - min) / (max - min || 1)) * (h - pad * 2);
      return `${i === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="w-full" aria-hidden>
      <defs>
        <linearGradient id="mvSpark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(201,162,39,0.35)" />
          <stop offset="100%" stopColor="rgba(201,162,39,0)" />
        </linearGradient>
      </defs>
      <path
        d={`${path} L ${w - pad} ${h} L ${pad} ${h} Z`}
        fill="url(#mvSpark)"
      />
      <path d={path} fill="none" stroke="var(--tos-accent-warm)" strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  );
}

export function MarketingOverviewScreen() {
  const o = marketingOverview;
  return (
    <div className="flex h-[780px] flex-col bg-tos-bg">
      <MarketingStatusBar />
      <div className="flex flex-1 flex-col gap-4 px-4 pb-6">
        <header className="pt-1">
          <div className="flex items-start gap-2.5">
            <Image
              src="/trading-os-mark.svg"
              alt=""
              width={36}
              height={36}
              className="mt-0.5 h-9 w-9 shrink-0 object-contain"
            />
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-[0.28em] text-tos-warm">
                Trading OS
              </p>
              <h1 className="mt-1 text-lg font-bold tracking-tight text-tos-text">
                Workspace
              </h1>
              <p className="mt-1 text-[12px] leading-snug text-tos-muted">{o.headline}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant="long">{o.terminalStatus}</Badge>
                <span className="font-mono text-[10px] text-tos-dim">{o.workspaceId}</span>
              </div>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-2 gap-2.5">
          <GlassPanel glow="warm" className="p-3.5">
            <p className="text-[9px] font-medium uppercase tracking-wider text-tos-dim">
              Alignment
            </p>
            <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-tos-text">
              {o.alignment}
            </p>
            <p className="text-[10px] text-tos-warm">{o.alignmentDelta}</p>
          </GlassPanel>
          <GlassPanel className="p-3.5">
            <p className="text-[9px] font-medium uppercase tracking-wider text-tos-dim">
              Pending
            </p>
            <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-tos-text">
              {o.pendingApprovals}
            </p>
            <p className="text-[10px] text-tos-muted">trade reviews</p>
          </GlassPanel>
          <GlassPanel className="p-3.5">
            <p className="text-[9px] font-medium uppercase tracking-wider text-tos-dim">
              Vault
            </p>
            <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-tos-text">
              {o.vaultItems}
            </p>
            <p className="text-[10px] text-tos-muted">notes & shots</p>
          </GlassPanel>
          <GlassPanel className="p-3.5">
            <p className="text-[9px] font-medium uppercase tracking-wider text-tos-dim">
              Alerts
            </p>
            <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-tos-text">
              {o.unreadAlerts}
            </p>
            <p className="text-[10px] text-tos-muted">unread</p>
          </GlassPanel>
        </div>

        <GlassPanel className="flex-1 overflow-hidden p-3.5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-tos-dim">
                30-day trace
              </p>
              <p className="mt-0.5 text-[11px] text-tos-muted">{o.equityCurveCaption}</p>
            </div>
            <span className="shrink-0 font-mono text-[9px] text-tos-dim">{o.lastSync}</span>
          </div>
          <div className="mt-2 -mx-1">
            <MiniSparkline />
          </div>
        </GlassPanel>

        <GlassPanel className="p-3.5">
          <p className="text-[10px] font-medium uppercase tracking-wider text-tos-dim">
            Operator
          </p>
          <p className="mt-1 text-[13px] font-medium text-tos-text">
            {marketingOperator.label} ·{" "}
            {marketingOperator.primarySymbols.join(" / ")}
          </p>
        </GlassPanel>
      </div>
    </div>
  );
}
