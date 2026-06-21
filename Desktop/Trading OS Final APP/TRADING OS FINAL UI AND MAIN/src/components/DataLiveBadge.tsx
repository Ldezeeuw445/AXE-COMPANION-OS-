export type DataLiveBadgeStatus = 'live' | 'snapshot' | 'demo' | 'off';

export function DataLiveBadge({
  status,
  label,
  title,
}: {
  status: DataLiveBadgeStatus;
  label?: string;
  /** Tooltip (e.g. last proxy error when status is demo). */
  title?: string;
}) {
  // Per product requirement: only show a LIVE badge when truly live.
  // For non-live states, render nothing (no demo/simulated labels).
  if (status === 'off') return null;

  const config: Record<DataLiveBadgeStatus, { dot: string; text: string; pulse: boolean; defaultLabel: string }> = {
    live: { dot: 'bg-green-500', text: 'text-green-400', pulse: true, defaultLabel: 'LIVE' },
    snapshot: { dot: 'bg-cyan-500', text: 'text-cyan-300', pulse: false, defaultLabel: 'SNAPSHOT' },
    demo: { dot: 'bg-white/35', text: 'text-white/45', pulse: false, defaultLabel: 'DEMO' },
    off: { dot: 'bg-white/10', text: 'text-white/20', pulse: false, defaultLabel: '' },
  };
  const c = config[status];
  return (
    <span className={`text-[9px] ${c.text} flex items-center gap-1 select-none`} title={title}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot} ${c.pulse ? 'animate-pulse' : ''}`} />
      {label ?? c.defaultLabel}
    </span>
  );
}

