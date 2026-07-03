"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { AmbientParticles } from "./AmbientParticles";
import { useSoundFx, type SoundName } from "@/hooks/useSoundFx";

/**
 * AmbientProvider — React context that owns ambient (particles) +
 * sound-fx + haptic-vibration state. Wraps the entire app shell so
 * any component can toggle effects or fire feedback via `useAmbient()`.
 */

type HapticStyle = "light" | "medium" | "heavy";

const HAPTIC_MS: Record<HapticStyle, number | number[]> = {
  light: 8,
  medium: 15,
  heavy: [10, 30, 10],
};

type AmbientCtx = {
  /** Particle canvas visible? */
  particlesOn: boolean;
  setParticlesOn: (v: boolean) => void;
  /** Sound effects enabled? */
  soundOn: boolean;
  setSoundOn: (v: boolean) => void;
  /** Haptic vibration enabled? */
  hapticsOn: boolean;
  setHapticsOn: (v: boolean) => void;
  /** Fire a named sound effect */
  playSound: (name: SoundName) => void;
  /** Trigger haptic vibration */
  vibrate: (style?: HapticStyle) => void;
};

const Ctx = createContext<AmbientCtx>({
  particlesOn: true,
  setParticlesOn: () => {},
  soundOn: false,
  setSoundOn: () => {},
  hapticsOn: true,
  setHapticsOn: () => {},
  playSound: () => {},
  vibrate: () => {},
});

const LS_PARTICLES = "tos-ambient";
const LS_HAPTICS = "tos-haptics";

export function AmbientProvider({ children }: { children: ReactNode }) {
  const [particlesOn, setParticlesOnState] = useState(true);
  const [hapticsOn, setHapticsOnState] = useState(true);
  const { play, enabled: soundOn, setEnabled: setSoundOn } = useSoundFx();

  // Hydrate from localStorage
  useEffect(() => {
    const storedP = localStorage.getItem(LS_PARTICLES);
    if (storedP === "off") setParticlesOnState(false);
    const storedH = localStorage.getItem(LS_HAPTICS);
    if (storedH === "off") setHapticsOnState(false);
  }, []);

  const setParticlesOn = useCallback((v: boolean) => {
    setParticlesOnState(v);
    localStorage.setItem(LS_PARTICLES, v ? "on" : "off");
  }, []);

  const setHapticsOn = useCallback((v: boolean) => {
    setHapticsOnState(v);
    localStorage.setItem(LS_HAPTICS, v ? "on" : "off");
  }, []);

  const vibrate = useCallback(
    (style: HapticStyle = "light") => {
      if (!hapticsOn) return;
      if (typeof navigator === "undefined" || !navigator.vibrate) return;
      try {
        navigator.vibrate(HAPTIC_MS[style]);
      } catch {
        /* some browsers throw */
      }
    },
    [hapticsOn],
  );

  return (
    <Ctx.Provider
      value={{
        particlesOn,
        setParticlesOn,
        soundOn,
        setSoundOn,
        hapticsOn,
        setHapticsOn,
        playSound: play,
        vibrate,
      }}
    >
      {particlesOn ? <AmbientParticles /> : null}
      {children}
    </Ctx.Provider>
  );
}

export function useAmbient() {
  return useContext(Ctx);
}
