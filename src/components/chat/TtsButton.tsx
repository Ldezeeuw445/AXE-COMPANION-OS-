"use client";

import { useState, useRef, useCallback } from "react";
import { Volume2, VolumeX } from "lucide-react";

type TtsButtonProps = {
  text: string;
};

export function TtsButton({ text }: TtsButtonProps) {
  const [speaking, setSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const toggle = useCallback(async () => {
    if (speaking) {
      audioRef.current?.pause();
      if (audioRef.current) audioRef.current.src = "";
      setSpeaking(false);
      return;
    }

    setSpeaking(true);

    try {
      const res = await fetch("/api/chat/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) {
        // Fallback to browser TTS if ElevenLabs unavailable
        if ("speechSynthesis" in window) {
          const utt = new SpeechSynthesisUtterance(text);
          utt.onend = () => setSpeaking(false);
          utt.onerror = () => setSpeaking(false);
          window.speechSynthesis.speak(utt);
        } else {
          setSpeaking(false);
        }
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onended = () => {
        setSpeaking(false);
        URL.revokeObjectURL(url);
      };
      audio.onerror = () => {
        setSpeaking(false);
        URL.revokeObjectURL(url);
      };

      await audio.play();
    } catch {
      setSpeaking(false);
    }
  }, [text, speaking]);

  return (
    <button
      type="button"
      onClick={toggle}
      title={speaking ? "Stop" : "Read aloud"}
      className="flex h-6 w-6 items-center justify-center rounded-md text-tos-dim transition-colors hover:text-tos-muted active:text-tos-muted"
      aria-label={speaking ? "Stop reading" : "Read aloud"}
    >
      {speaking ? (
        <VolumeX className="h-3.5 w-3.5 text-tos-accent-cyan" />
      ) : (
        <Volume2 className="h-3.5 w-3.5" />
      )}
    </button>
  );
}
