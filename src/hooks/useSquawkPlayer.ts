"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { readSquawkStationIds, resolveSquawkStations } from "@/lib/squawk/prefs";
import { SQUAWK_STATIONS, type SquawkStation } from "@/lib/squawk/streams";
import { useAmbient } from "@/components/ambient/AmbientProvider";

export function useSquawkPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [stations, setStations] = useState<SquawkStation[]>(() =>
    resolveSquawkStations(readSquawkStationIds()),
  );
  const [stationIdx, setStationIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { vibrate } = useAmbient();

  const syncStations = useCallback((ids: string[] | null) => {
    setStations(resolveSquawkStations(ids));
    setStationIdx(0);
    setPlaying(false);
    setError(null);
  }, []);

  useEffect(() => {
    syncStations(readSquawkStationIds());

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/preferences/squawk-stations", { credentials: "include" });
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as { stationIds?: string[] };
        if (!cancelled && json.stationIds) syncStations(json.stationIds);
      } catch {
        /* ignore */
      }
    })();

    const onChanged = () => syncStations(readSquawkStationIds());
    window.addEventListener("axe:squawk-stations-changed", onChanged);
    return () => {
      cancelled = true;
      window.removeEventListener("axe:squawk-stations-changed", onChanged);
    };
  }, [syncStations]);

  const station = stations[stationIdx % Math.max(stations.length, 1)] ?? SQUAWK_STATIONS[0];

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.src = station.url;
    audio.load();
  }, [station.url]);

  const nextStation = useCallback(() => {
    vibrate("light");
    setPlaying(false);
    setStationIdx((i) => (i + 1) % Math.max(stations.length, 1));
  }, [stations.length, vibrate]);

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
        void audio.play().then(() => setPlaying(true)).catch(() => {
          setPlaying(false);
          setError("Stream unavailable");
        });
      } else {
        setPlaying(false);
        setError("Stream unavailable");
      }
    });
  }, [playing, station.fallbackUrl, vibrate]);

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

  return {
    audioRef,
    station,
    stations,
    playing,
    error,
    togglePlay,
    nextStation,
  };
}
