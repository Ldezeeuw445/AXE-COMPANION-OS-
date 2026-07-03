"use client";

import { useState, useRef, useCallback } from "react";
import { Volume2, VolumeX } from "lucide-react";

type TtsButtonProps = {
  text: string;
};

export function TtsButton({ text }: TtsButtonProps) {
  const [speaking, setSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stopSpeaking = useCallback(() => {
    setSpeaking(false);
    window.dispatchEvent(new CustomEvent("axe:speaking", { detail: { speaking: false } }));
  }, []);

  const startSpeaking = useCallback(() => {
    setSpeaking(true);
    window.dispatchEvent(new CustomEvent("axe:speaking", { detail: { speaking: true } }));
  }, []);

  const toggle = useCallback(async () => {
    if (speaking) {
      audioRef.current?.pause();
      if (audioRef.current) audioRef.current.src = "";
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      stopSpeaking();
      return;
    }

    startSpeaking();

    try {
      const res = await fetch("/api/chat/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) {
        if ("speechSynthesis" in window) {
          const utt = new SpeechSynthesisUtterance(text);
          utt.onend = () => stopSpeaking();
          utt.onerror = () => stopSpeaking();
          window.speechSynthesis.speak(utt);
        } else {
          stopSpeaking();
        }
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onended = () => {
        stopSpeaking();
        URL.revokeObjectURL(url);
      };
      audio.onerror = () => {
        stopSpeaking();
        URL.revokeObjectURL(url);
      };

      await audio.play();
    } catch {
      stopSpeaking();
    }
  }, [text, speaking, startSpeaking, stopSpeaking]);

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
