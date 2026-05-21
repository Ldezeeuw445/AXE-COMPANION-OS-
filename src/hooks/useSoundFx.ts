"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * useSoundFx — lightweight synthetic sound effects via Web Audio API.
 *
 * No external audio files needed. Sounds are generated on-the-fly:
 * - `tap`    → short tonal click (nav interaction)
 * - `whoosh` → filtered noise sweep (page transition feel)
 * - `chime`  → ascending two-tone (success / order placed)
 *
 * Controlled via localStorage key `tos-sound` ("on" | "off").
 * Default: "off" (opt-in).
 */

const LS_KEY = "tos-sound";

function getStoredPref(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(LS_KEY) === "on";
}

/** Play a short tonal click — ~60ms, subtle. */
function playTap(ctx: AudioContext) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(880, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.06);
  gain.gain.setValueAtTime(0.08, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.07);
}

/** Play a filtered noise sweep — ~200ms, whoosh feel. */
function playWhoosh(ctx: AudioContext) {
  const bufferSize = ctx.sampleRate * 0.2;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * 0.5;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(2000, ctx.currentTime);
  filter.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.2);
  filter.Q.value = 2;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.06, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);

  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start();
  source.stop(ctx.currentTime + 0.22);
}

/** Play ascending two-tone chime — ~300ms. */
function playChime(ctx: AudioContext) {
  [660, 880].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    const t = ctx.currentTime + i * 0.12;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.07, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.16);
  });
}

export type SoundName = "tap" | "whoosh" | "chime";

const PLAYERS: Record<SoundName, (ctx: AudioContext) => void> = {
  tap: playTap,
  whoosh: playWhoosh,
  chime: playChime,
};

export function useSoundFx() {
  const ctxRef = useRef<AudioContext | null>(null);
  const [enabled, setEnabledState] = useState(false);

  // Sync from localStorage on mount
  useEffect(() => {
    setEnabledState(getStoredPref());
  }, []);

  const setEnabled = useCallback((on: boolean) => {
    setEnabledState(on);
    localStorage.setItem(LS_KEY, on ? "on" : "off");
  }, []);

  const play = useCallback(
    (name: SoundName) => {
      if (!enabled) return;
      if (typeof window === "undefined") return;

      // Lazy-init AudioContext (must be after user gesture)
      if (!ctxRef.current) {
        ctxRef.current = new AudioContext();
      }
      const ctx = ctxRef.current;
      if (ctx.state === "suspended") {
        ctx.resume();
      }

      const fn = PLAYERS[name];
      if (fn) fn(ctx);
    },
    [enabled]
  );

  return { play, enabled, setEnabled };
}
