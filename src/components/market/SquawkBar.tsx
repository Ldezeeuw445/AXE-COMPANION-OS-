"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, Radio, SkipForward, Volume2 } from "lucide-react";
import { SQUAWK_STATIONS } from "@/lib/squawk/streams";
import { useAmbient } from "@/components/ambient/AmbientProvider";

/**
 * Live squawk bar — 24/7 business/news audio for traders.
 * Sits above the bottom nav; auto-fails over to the next station on error.
 */
export function SquawkBar({ className = "" }: { className?: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [stationIdx, setStationIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { vibrate } = useAmbient();

  const station = SQUAWK_STATIONS[stationIdx % SQUAWK_STATIONS.length];

  const loadStation = useCallback(
    (idx: number, autoplay = false) => {
      const audio = audioRef.current;
      if (!audio) return;
      const next = SQUAWK_STATIONS[idx % SQUAWK_STATIONS.length];
      setError(null);
      audio.src = next.url;
      audio.load();
      if (autoplay) {
        void audio.play().then(() => setPlaying(true)).catch(() => {
          if (next.fallbackUrl) {
            audio.src = next.fallbackUrl;
            audio.load();
            void audio.play().then(() => setPlaying(true)).catch(() => {
              setPlaying(false);
              setError("Stream unavailable");
            });
          } else {
            setPlaying(false);
            setError("Stream unavailable");
          }
        });
      }
    },
    [],
  );

  useEffect(() => {
    loadStation(stationIdx, false);
  }, [stationIdx, loadStation]);

  const togglePlay = useCallback(() => {
    vibrate("light");
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
      return;
    }
    void audio.play().then(() => {
      setPlaying(true);
      setError(null);
    }).catch(() => {
      if (station.fallbackUrl) {
        audio.src = station.fallbackUrl;
        audio.load();
        void audio.play().then(() => setPlaying(true)).catch(() => setError("Stream unavailable"));
      } else {
        setError("Stream unavailable");
      }
    });
  }, [playing, station.fallbackUrl, vibrate]);

  const nextStation = useCallback(() => {
    vibrate("light");
    setPlaying(false);
    setStationIdx((i) => (i + 1) % SQUAWK_STATIONS.length);
  }, [vibrate]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onEnded = () => nextStation();
    const onError = () => {
      if (playing) nextStation();
      else setError("Stream unavailable");
    };
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    return () => {
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
    };
  }, [nextStation, playing]);

  return (
    <div
      className={`flex h-9 shrink-0 items-center gap-2 border-t border-white/[0.06] bg-[rgba(8,9,12,0.92)] px-3 backdrop-blur-md ${className}`}
    >
      <audio ref={audioRef} preload="none" crossOrigin="anonymous" />

      <Radio className="h-3.5 w-3.5 shrink-0 text-cyan-400/70" aria-hidden />

      <div className="min-w-0 flex-1">
        <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-white/85">
          {station.name}
        </p>
        <p className="truncate text-[9px] text-white/40">
          {error ?? station.tag}
          {playing ? " · LIVE" : ""}
        </p>
      </div>

      <button
        type="button"
        onClick={togglePlay}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.05] text-white/80 active:scale-95"
        aria-label={playing ? "Pause squawk" : "Play squawk"}
      >
        {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
      </button>

      <button
        type="button"
        onClick={nextStation}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.05] text-white/60 active:scale-95"
        aria-label="Next station"
      >
        <SkipForward className="h-3 w-3" />
      </button>

      <Volume2 className="h-3.5 w-3.5 shrink-0 text-white/25" aria-hidden />
    </div>
  );
}
