"use client";

import { useCallback, useRef, useState, type PointerEvent, type ReactNode } from "react";
import Link from "next/link";

/**
 * TOS companion has a floating desk-chat pair with a snap slot.
 * Chrome only — no invented market replies. Buttons go to /login.
 */
export function LandingDeskChat() {
  return (
    <section id="desk-chat" className="relative z-10 border-t border-white/[0.04] px-5 py-16 md:py-24">
      <div className="mx-auto max-w-6xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-200/80">
          Floating desk chat · Terminal
        </p>
        <p className="mt-3 max-w-2xl text-sm text-tos-muted">
          Drag to explore — drop near the slot to snap back, or use pin in the header. Minimize with −.
          Sample chrome only — not a live session.
        </p>

        <div
          id="desk-chat-slot"
          data-landing-desk-slot="true"
          className="mt-8 min-h-[18rem] rounded-2xl border border-dashed border-cyan-300/20 bg-cyan-300/[0.03] p-3 sm:p-4"
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <DeskWindow title="AXE" kicker="Assistant">
              <p className="text-[12.5px] leading-relaxed text-white/70">
                Sign in to talk to AXE about your chart, journal and news. Nothing here is a live reply.
              </p>
              <Link
                href="/login"
                className="mt-4 inline-flex h-10 items-center justify-center rounded-lg border border-cyan-300/25 bg-cyan-300/[0.08] px-4 text-xs font-medium text-cyan-100"
              >
                Open AXE
              </Link>
            </DeskWindow>
            <DeskWindow title="Intel" kicker="Desk">
              <p className="text-[12.5px] leading-relaxed text-white/70">
                Intel sits next to AXE on the desk. Sample chrome only — open the app for your own book.
              </p>
              <Link
                href="/login"
                className="mt-4 inline-flex h-10 items-center justify-center rounded-lg border border-white/12 bg-white/[0.04] px-4 text-xs font-medium text-white/80"
              >
                Sign in
              </Link>
            </DeskWindow>
          </div>
        </div>
      </div>

      <FloatingAxeLauncher />
    </section>
  );
}

function DeskWindow({
  title,
  kicker,
  children,
}: {
  title: string;
  kicker: string;
  children: ReactNode;
}) {
  return (
    <div className="axe-landing-card-glow overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/80">{title}</p>
          <p className="text-[10px] uppercase tracking-[0.16em] text-white/35">{kicker}</p>
        </div>
        <p className="text-[10px] uppercase tracking-[0.14em] text-amber-100/70">Demo</p>
      </div>
      <div className="p-5">
        {children}
        <div className="mt-5 rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 text-[12px] text-white/35">
          Ask AXE…
        </div>
      </div>
    </div>
  );
}

const DEFAULT_POS = { x: 24, y: 24 };

function FloatingAxeLauncher() {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [pos, setPos] = useState(DEFAULT_POS);
  const dragRef = useRef({ active: false, moved: false });

  const snapIfNearSlot = useCallback(() => {
    const slot = document.getElementById("desk-chat-slot");
    const launcher = document.querySelector("[data-landing-desk-chat='true']");
    if (!slot || !(launcher instanceof HTMLElement)) return;
    const slotBox = slot.getBoundingClientRect();
    const box = launcher.getBoundingClientRect();
    const overlap =
      box.left < slotBox.right + 40 &&
      box.right > slotBox.left - 40 &&
      box.top < slotBox.bottom + 40 &&
      box.bottom > slotBox.top - 40;
    if (overlap) setPos(DEFAULT_POS);
  }, []);

  const onPointerDown = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { active: true, moved: false };
  }, []);

  const onPointerMove = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    if (!dragRef.current.active) return;
    if (Math.abs(event.movementX) + Math.abs(event.movementY) > 2) {
      dragRef.current.moved = true;
    }
    setPos((prev) => ({
      x: Math.max(12, prev.x - event.movementX),
      y: Math.max(12, prev.y - event.movementY),
    }));
  }, []);

  const onPointerUp = useCallback(() => {
    const { moved } = dragRef.current;
    dragRef.current.active = false;
    snapIfNearSlot();
    if (!moved && !pinned) setOpen((v) => !v);
  }, [pinned, snapIfNearSlot]);

  return (
    <div
      className="fixed z-40 hidden sm:block"
      style={{ right: pos.x, bottom: pos.y }}
      data-landing-desk-chat="true"
    >
      {open || pinned ? (
        <div className="mb-3 w-[22rem] overflow-hidden rounded-2xl border border-white/[0.1] bg-[#07090c] shadow-[0_24px_60px_-24px_rgba(0,0,0,0.9)]">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100">AXE · demo</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPinned((v) => !v)}
                className={`text-[10px] uppercase tracking-[0.14em] ${
                  pinned ? "text-cyan-200" : "text-white/45 hover:text-white"
                }`}
                aria-pressed={pinned}
              >
                Pin
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setPinned(false);
                }}
                className="text-xs text-white/45 hover:text-white"
                aria-label="Minimize demo chat"
              >
                −
              </button>
            </div>
          </div>
          <div className="p-4">
            <p className="text-[12.5px] leading-relaxed text-white/65">
              Sample desk chat — not a live session and not your account. Sign in to talk to AXE.
            </p>
            <Link
              href="/login"
              className="mt-4 inline-flex h-9 items-center justify-center rounded-full bg-gradient-to-r from-cyan-400 to-teal-400 px-4 text-xs font-semibold text-[#04161B]"
            >
              Sign in to AXE
            </Link>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        aria-label="Open demo AXE chat"
        aria-expanded={open || pinned}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="grid h-12 w-12 place-items-center rounded-full border border-cyan-300/40 bg-[#04161B] text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-100 shadow-[0_12px_30px_-10px_rgba(34,211,238,0.55)]"
      >
        AXE
      </button>
    </div>
  );
}
