"use client";

/**
 * The glow along the bottom of the composer: it rises with your voice while
 * dictating, blooms while AXE speaks its reply, and gathers into a travelling
 * beam while AXE is thinking.
 *
 * Dictation itself stays on SpeechRecognition (which does its own capture);
 * this only opens a second microphone stream for the visual. If that is
 * refused or unsupported the beam falls back to the spoken-reply level, so the
 * composer never ends up in a broken state because of a decoration.
 */

import { useEffect, type ReactNode } from "react";
import { VoiceBeam, useMicrophone } from "voice-glow";
import { getSpeechLevel } from "@/lib/voice/speechLevel";

export function AxeVoiceBeam({
  listening,
  processing,
  children,
}: {
  /** The trader is dictating. */
  listening: boolean;
  /** AXE is working on the reply. */
  processing: boolean;
  children: ReactNode;
}) {
  const mic = useMicrophone();
  const { start, stop, state } = mic;

  useEffect(() => {
    if (listening) {
      if (state === "idle") void start();
    } else if (state === "live") {
      stop();
    }
  }, [listening, state, start, stop]);

  return (
    <VoiceBeam
      type="default"
      colorVariant="colorful"
      theme="dark"
      stream={listening ? mic.stream : null}
      level={getSpeechLevel}
      processing={processing}
    >
      {children}
    </VoiceBeam>
  );
}
