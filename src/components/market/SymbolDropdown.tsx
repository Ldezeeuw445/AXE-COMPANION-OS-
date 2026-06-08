"use client";

import { useRouter } from "next/navigation";

export function SymbolDropdown({ symbols, current }: { symbols: string[]; current: string }) {
  const router = useRouter();
  if (symbols.length <= 1) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-wider text-tos-dim">Filtered by</span>
      <div className="relative">
        {/* Hidden native select layered over styled trigger for accessibility */}
        <select
          defaultValue={current}
          onChange={(e) => {
            const val = e.target.value;
            if (val === "__ALL__") {
              router.push("/market");
            } else {
              router.push(`/market?symbol=${encodeURIComponent(val)}`);
            }
          }}
          className="absolute inset-0 z-10 cursor-pointer opacity-0"
          aria-label="Filter by symbol"
        >
          <option value="__ALL__">ALL</option>
          {symbols.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1 rounded-lg border border-white/[0.10] bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/80">
          {current || "ALL"}
          <svg className="h-3 w-3 text-white/40" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
    </div>
  );
}
