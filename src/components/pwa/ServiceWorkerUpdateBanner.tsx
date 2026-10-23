"use client";

/**
 * Presentational SW update prompt. ServiceWorkerInit owns the waiting-worker
 * handshake; this markup is shared with the PWA probe so iPhone/Samsung QA
 * can screenshot the same banner without a real waiting worker.
 */
export function ServiceWorkerUpdateBanner({
  onReload,
  className = "",
}: {
  onReload: () => void;
  className?: string;
}) {
  return (
    <div
      role="status"
      data-testid="sw-update-banner"
      className={`flex items-center justify-center gap-3 bg-[#101013]/95 px-4 py-2 text-[12px] text-[#ededef] shadow-[0_8px_24px_-12px_rgba(0,0,0,0.8)] backdrop-blur-md ${className}`}
      style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
    >
      <span>A new AXE version is ready. Reload to drop the stale bundle.</span>
      <button
        type="button"
        onClick={onReload}
        className="rounded border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold tracking-wide uppercase"
      >
        Reload
      </button>
    </div>
  );
}
