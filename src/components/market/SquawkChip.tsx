"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, Radio, SkipForward } from "lucide-react";
import { SQUAWK_STATIONS } from "@/lib/squawk/streams";
import { useAmbient } from "@/components/ambient/AmbientProvider";

/** Compact inline squawk control for chart top bar (tablet). */
export function SquawkChip({ className = "" }: { className?: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [stationIdx, setStationIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const { vibrate } = useAmbient();
  const station = SQUAWK_STATIONS[stationIdx % SQUAWK_STATIONS.length];

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.src = station.url;
    audio.load();
  }, [station.url]);

  const togglePlay = useCallback(() => {
    vibrate("light");
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
      return;
    }
    void audio.play().then(() => setPlaying(true)).catch(() => {
      if (station.fallbackUrl) {
        audio.src = station.fallbackUrl;
        audio.load();
        void audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
      }
    });
  }, [playing, station.fallbackUrl, vibrate]);

  const nextStation = useCallback(() => {
    vibrate("light");
    setPlaying(false);
    setStationIdx((i) => (i + 1) % SQUAWK_STATIONS.length);
  }, [vibrate]);

  return (
    <div
      className={`flex shrink-0 items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 ${className}`}
    >
      <audio ref={audioRef} preload="none" crossOrigin="anonymous" />
      <Radio className="h-3 w-3 shrink-0 text-cyan-400/70" aria-hidden />
      <span className="max-w-[5.5rem] truncate text-[9px] font-semibold uppercase tracking-wide text-white/70">
        {station.name.split(" ")[0]}
      </span>
      <button
        type="button"
        onClick={togglePlay}
        className="grid h-6 w-6 place-items-center rounded-full border border-white/10 text-white/75 active:scale-95"
        aria-label={playing ? "Pause squawk" : "Play squawk"}
      >
        {playing ? <Pause className="h-2.5 w-2.5" /> : <Play className="h-2.5 w-2.5" />}
      </button>
      <button
        type="button"
        onClick={nextStation}
        className="grid h-6 w-6 place-items-center rounded-full text-white/40 active:scale-95"
        aria-label="Next station"
      >
        <SkipForward className="h-2.5 w-2.5" />
      </button>
    </div>
  );
}
