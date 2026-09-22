"use client";

/**
 * The glow along the bottom of the composer: it rises with your voice while
 * dictating, blooms while AXE speaks its reply, and gathers into a travelling
 * beam while AXE is thinking.
 *
 * The microphone is deliberately *not* opened here. getUserMedia has to be
 * called from the click itself — an effect that fires after the render has
 * already lost the user activation on Safari, which is the difference between
 * a glow that moves and one that never starts. The composer's mic button owns
 * the stream and hands it down.
 */

import type { ReactNode } from "react";
import { VoiceBeam } from "voice-glow";
import { getSpeechLevel } from "@/lib/voice/speechLevel";

export function AxeVoiceBeam({
  stream,
  processing,
  borderRadius,
  children,
}: {
  /** Live microphone while dictating, else null. */
  stream: MediaStream | null;
  /** AXE is working on the reply. */
  processing: boolean;
  /** Radius of the card being wrapped. Passed explicitly because the beam
   *  auto-detects its first child, which here is another wrapper. */
  borderRadius?: number;
  children: ReactNode;
}) {
  return (
    <VoiceBeam
      // Defaults otherwise — only what this host actually needs is set.
      borderRadius={borderRadius}
      stream={stream}
      // No stream (AXE speaking, or mic refused): follow the spoken reply.
      level={getSpeechLevel}
      processing={processing}
    >
      {children}
    </VoiceBeam>
  );
}
