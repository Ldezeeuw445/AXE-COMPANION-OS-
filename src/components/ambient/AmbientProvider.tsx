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
 * sound-fx state. Wraps the entire app shell so any component can
 * toggle effects or play a sound via `useAmbient()`.
 */

type AmbientCtx = {
  /** Particle canvas visible? */
  particlesOn: boolean;
  setParticlesOn: (v: boolean) => void;
  /** Sound effects enabled? */
  soundOn: boolean;
  setSoundOn: (v: boolean) => void;
  /** Fire a named sound effect */
  playSound: (name: SoundName) => void;
};

const Ctx = createContext<AmbientCtx>({
  particlesOn: true,
  setParticlesOn: () => {},
  soundOn: false,
  setSoundOn: () => {},
  playSound: () => {},
});

const LS_PARTICLES = "tos-ambient";

export function AmbientProvider({ children }: { children: ReactNode }) {
  const [particlesOn, setParticlesOnState] = useState(true);
  const { play, enabled: soundOn, setEnabled: setSoundOn } = useSoundFx();

  // Hydrate from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(LS_PARTICLES);
    if (stored === "off") setParticlesOnState(false);
  }, []);

  const setParticlesOn = useCallback((v: boolean) => {
    setParticlesOnState(v);
    localStorage.setItem(LS_PARTICLES, v ? "on" : "off");
  }, []);

  return (
    <Ctx.Provider
      value={{
        particlesOn,
        setParticlesOn,
        soundOn,
        setSoundOn,
        playSound: play,
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
