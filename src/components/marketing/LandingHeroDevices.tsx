"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The landing hero: an iPhone and an iPad on one block, with the dot grid
 * behind it lighting up when the pointer is on the block.
 *
 * Both screens run `/hero-demo/app.html` — a self-contained mock with no
 * account, no Supabase and no network calls. The earlier version of this hero
 * iframed `/demo/embed`, which signed the visitor into a shared anonymous
 * account. Those are gone, so that hero now shows a sign-in form inside the
 * phone. A landing page has to work for a stranger who is not signed in, so
 * the mock is the honest engine here — and it says "NO LOGIN · DEMO" on itself
 * rather than passing for a live account.
 *
 * Each frame renders the mock at a real device's logical size and scales the
 * whole iframe down to fit. Letting the iframe take the bezel's own width
 * instead gives the page a ~250px viewport — narrower than any phone ever
 * shipped — and the mock's header and tab bar collapse into each other.
 */

const DEVICES = {
  phone: { w: 390, h: 844, query: "phone" },
  ipad: { w: 1024, h: 768, query: "tablet" },
} as const;

type DeviceKey = keyof typeof DEVICES;

function DeviceFrame({ device, eager }: { device: DeviceKey; eager: boolean }) {
  const { w, h, query } = DEVICES[device];
  const screenRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  const measure = useCallback(() => {
    const el = screenRef.current;
    if (!el) return;
    const width = el.clientWidth;
    if (width > 0) setScale(width / w);
  }, [w]);

  useEffect(() => {
    measure();
    const el = screenRef.current;
    if (!el || typeof ResizeObserver === "undefined") {
      // Without ResizeObserver a resize just keeps the first measurement,
      // which is wrong but legible — better than no frame at all.
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  return (
    <div className={`axe-hero-device axe-hero-device--${device}`}>
      <div className="axe-hero-bezel">
        {device === "phone" ? <div className="axe-hero-notch" aria-hidden /> : null}
        <div className="axe-hero-screen" ref={screenRef}>
          {/* Held back until measured so the mock never flashes at the wrong
              size, which on the phone looks like a broken layout. */}
          {scale > 0 ? (
            <iframe
              title={`AXE Companion on ${device === "phone" ? "iPhone" : "iPad"} — interactive demo`}
              src={`/hero-demo/app.html?device=${query}&chrome=off`}
              loading={eager ? "eager" : "lazy"}
              width={w}
              height={h}
              style={{ transform: `scale(${scale})` }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function LandingHeroDevices() {
  const [lit, setLit] = useState(false);

  // Pointer events rather than mouse events so a touch on the block lights it
  // too, and focus-within so a keyboard user reaching the frames gets the same
  // signal instead of a silently dead block.
  return (
    <div className="relative mx-auto w-full max-w-[1180px]">
      <div className={`axe-hero-dots ${lit ? "axe-hero-dots-active" : ""}`} aria-hidden />

      <div
        className={`axe-hero-stage ${lit ? "axe-hero-stage-active" : ""}`}
        onPointerEnter={() => setLit(true)}
        onPointerLeave={() => setLit(false)}
        onFocusCapture={() => setLit(true)}
        onBlurCapture={() => setLit(false)}
      >
        {/* Below 640px the iPad frame is display:none (globals.css) — at that
            width its 1024px mock renders at 0.3 scale and reads as a smudge.
            Hidden rather than unmounted so the markup is the same on the
            server and the client, and so `loading="lazy"` never fetches it. */}
        <DeviceFrame device="phone" eager />
        <DeviceFrame device="ipad" eager={false} />
      </div>

      <p className="relative z-10 mt-4 text-center text-[11px] uppercase tracking-[0.2em] text-white/38">
        Tap around — these are live demos, no account needed
      </p>
    </div>
  );
}
