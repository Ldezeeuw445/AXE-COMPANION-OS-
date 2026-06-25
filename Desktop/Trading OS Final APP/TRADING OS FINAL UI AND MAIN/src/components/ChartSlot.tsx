import { Activity } from 'lucide-react';

/**
 * ChartSlot — Placeholder for user's own chart component
 *
 * Accepts optional children. If none provided, shows a "chart slot ready"
 * placeholder. The user will plug their own TradingView / Lightweight
 * Charts / custom canvas component here later.
 */
export default function ChartSlot({
  children,
  symbol,
}: {
  children?: React.ReactNode;
  /** Active pair from global context — shown until a real chart is mounted. */
  symbol?: string;
}) {
  if (children) {
    return <div className="w-full h-full">{children}</div>;
  }

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-[#0a0a0a]">
      <Activity size={48} className="text-cyan-400/30 mb-4" />
      {symbol ? (
        <p className="text-xs font-mono text-cyan-400/80 mb-1 tabular-nums">{symbol}</p>
      ) : null}
      <p className="text-sm text-white/50 mb-2">Chart slot ready</p>
      <p className="text-xs text-white/30 max-w-sm text-center">
        Your chart component will render here. Import your TradingView, Lightweight Charts, or custom canvas component into Chart.tsx and pass it as children to &lt;ChartSlot&gt;.
      </p>
      <div className="mt-4 flex items-center gap-2">
        <span className="text-[9px] text-white/20 px-2 py-1 rounded bg-white/[0.03] border border-white/[0.05]">TradingView</span>
        <span className="text-[9px] text-white/20 px-2 py-1 rounded bg-white/[0.03] border border-white/[0.05]">Lightweight Charts</span>
        <span className="text-[9px] text-white/20 px-2 py-1 rounded bg-white/[0.03] border border-white/[0.05]">Custom Canvas</span>
      </div>
    </div>
  );
}
