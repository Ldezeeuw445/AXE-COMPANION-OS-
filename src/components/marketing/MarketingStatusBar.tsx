export function MarketingStatusBar() {
  return (
    <div className="flex items-center justify-between px-5 pb-2 pt-3 text-[11px] font-medium tabular-nums text-tos-text">
      <span>9:41</span>
      <div className="flex items-center gap-1.5">
        <span className="text-tos-dim" aria-hidden>
          ●●●
        </span>
        <svg width={18} height={11} viewBox="0 0 18 11" fill="none" aria-hidden>
          <rect x="0.5" y="6" width="3" height="4" rx="0.8" fill="currentColor" className="text-tos-muted" />
          <rect x="5" y="4.5" width="3" height="5.5" rx="0.8" fill="currentColor" className="text-tos-muted" />
          <rect x="9.5" y="3" width="3" height="7" rx="0.8" fill="currentColor" className="text-tos-muted" />
          <rect x="14" y="1" width="3" height="9" rx="0.8" fill="currentColor" className="text-tos-warm" />
        </svg>
      </div>
    </div>
  );
}
