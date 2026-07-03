"use client";

import { Pause, Play, Radio, SkipForward } from "lucide-react";
import { useSquawkPlayer } from "@/hooks/useSquawkPlayer";

/** Compact inline squawk control for chart top bar (tablet). */
export function SquawkChip({
  className = "",
  variant = "default",
}: {
  className?: string;
  variant?: "default" | "tablet";
}) {
  const { audioRef, station, playing, togglePlay, nextStation } = useSquawkPlayer();
  const isTablet = variant === "tablet";

  return (
    <div
      className={`flex shrink-0 items-center gap-1 rounded-lg border px-1.5 py-0.5 ${
        isTablet
          ? "border-cyan-400/35 bg-cyan-400/[0.08]"
          : "border-white/[0.08] bg-white/[0.04]"
      } ${className}`}
    >
      <audio ref={audioRef} preload="none" crossOrigin="anonymous" />
      <Radio className={`h-3.5 w-3.5 shrink-0 ${isTablet ? "text-cyan-300" : "text-cyan-400/70"}`} aria-hidden />
      <span
        className={`max-w-[5.5rem] truncate text-[9px] font-semibold uppercase tracking-wide ${
          isTablet ? "text-cyan-100/90" : "text-white/70"
        }`}
      >
        {station.name.split(" ")[0]}
      </span>
      <button
        type="button"
        onClick={togglePlay}
        className={`grid h-7 w-7 place-items-center rounded-lg border active:scale-95 ${
          isTablet
            ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-100"
            : "border-white/10 text-white/75 rounded-full h-6 w-6"
        }`}
        aria-label={playing ? "Pause squawk" : "Play squawk"}
      >
        {playing ? <Pause className="h-2.5 w-2.5" /> : <Play className="h-2.5 w-2.5" />}
      </button>
      <button
        type="button"
        onClick={nextStation}
        className={`grid place-items-center active:scale-95 ${
          isTablet ? "h-7 w-7 rounded-lg text-cyan-200/55" : "h-6 w-6 rounded-full text-white/40"
        }`}
        aria-label="Next station"
      >
        <SkipForward className="h-2.5 w-2.5" />
      </button>
    </div>
  );
}
