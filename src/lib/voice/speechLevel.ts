"use client";

/**
 * How loud AXE is speaking right now, 0–1.
 *
 * VoiceBeam reacts to a MediaStream (the microphone) or to a level you drive
 * yourself. TTS playback is neither: it is an <audio> element. So the player
 * taps the element through a Web Audio analyser and parks the level here,
 * where any beam on the page can sample it once per frame — a getter rather
 * than React state, because this changes ~60x a second and must not re-render
 * the composer.
 *
 * The element is routed analyser → destination, so tapping it does not mute
 * playback.
 */

let level = 0;
let ctx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let raf: number | null = null;
let buffer: Uint8Array<ArrayBuffer> | null = null;
/** An element can only be adopted by one MediaElementSource, ever. */
const attached = new WeakSet<HTMLAudioElement>();

/**
 * Open the AudioContext while a click is still in hand.
 *
 * Safari only lets a context start inside a user gesture, and the TTS request
 * is awaited before the element exists — by then the gesture is spent and the
 * context stays suspended, so the analyser reads silence and the glow never
 * moves. Call this first thing in the play handler.
 */
export function primeSpeechAudio(): void {
  ensureContext();
}

function ensureContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx ??= new Ctor();
    void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Sample for `<VoiceBeam level={getSpeechLevel}>`. */
export function getSpeechLevel(): number {
  return level;
}

function tick() {
  if (!analyser || !buffer) return;
  analyser.getByteTimeDomainData(buffer);
  let peak = 0;
  for (let i = 0; i < buffer.length; i += 1) {
    const deviation = Math.abs(buffer[i] - 128) / 128;
    if (deviation > peak) peak = deviation;
  }
  // Ease down so the glow falls off between syllables instead of flickering.
  level = Math.max(peak, level * 0.82);
  raf = requestAnimationFrame(tick);
}

/** Start publishing the level of this audio element. Safe to call twice. */
export function trackSpeechAudio(audio: HTMLAudioElement): void {
  if (typeof window === "undefined") return;
  try {
    if (!ensureContext() || !ctx) return;
    if (!analyser) {
      analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.connect(ctx.destination);
      buffer = new Uint8Array(new ArrayBuffer(analyser.fftSize));
    }
    if (!attached.has(audio)) {
      ctx.createMediaElementSource(audio).connect(analyser);
      attached.add(audio);
    }
    if (raf == null) raf = requestAnimationFrame(tick);
  } catch {
    // No Web Audio (or the element is cross-origin): playback still works,
    // the beam just stays idle.
  }
}

/** Playback ended — let the glow settle back to nothing. */
export function stopSpeechTracking(): void {
  if (raf != null) {
    cancelAnimationFrame(raf);
    raf = null;
  }
  level = 0;
}
