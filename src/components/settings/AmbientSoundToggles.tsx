"use client";

import { useAmbient } from "@/components/ambient/AmbientProvider";

/**
 * Settings toggles for ambient particles, sound effects, and haptic vibration.
 * Reads/writes from the AmbientProvider context (backed by localStorage).
 */
export function AmbientSoundToggles() {
  const {
    particlesOn,
    setParticlesOn,
    soundOn,
    setSoundOn,
    playSound,
    hapticsOn,
    setHapticsOn,
    vibrate,
  } = useAmbient();

  return (
    <div className="space-y-3">
      {/* Ambient particles */}
      <label className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-tos-text">Ambient particles</p>
          <p className="text-[10.5px] text-tos-muted">
            Floating dots and connecting lines behind content
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={particlesOn}
          onClick={() => setParticlesOn(!particlesOn)}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${
            particlesOn
              ? "bg-[var(--icon-chat)]"
              : "bg-white/10"
          }`}
        >
          <span
            className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200 ${
              particlesOn ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </label>

      {/* Haptic vibration */}
      <label className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-tos-text">Haptic feedback</p>
          <p className="text-[10.5px] text-tos-muted">
            Light vibration on nav switches and key actions
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={hapticsOn}
          onClick={() => {
            const next = !hapticsOn;
            setHapticsOn(next);
            // Demo vibrate so the user feels it
            if (next) setTimeout(() => vibrate("medium"), 100);
          }}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${
            hapticsOn
              ? "bg-[var(--icon-chat)]"
              : "bg-white/10"
          }`}
        >
          <span
            className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200 ${
              hapticsOn ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </label>

      {/* Sound effects */}
      <label className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-tos-text">Sound effects</p>
          <p className="text-[10.5px] text-tos-muted">
            Subtle tap, whoosh and chime sounds
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={soundOn}
          onClick={() => {
            const next = !soundOn;
            setSoundOn(next);
            // Play a demo tap so the user hears it
            if (next) setTimeout(() => playSound("tap"), 100);
          }}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${
            soundOn
              ? "bg-[var(--icon-chat)]"
              : "bg-white/10"
          }`}
        >
          <span
            className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200 ${
              soundOn ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </label>
    </div>
  );
}
