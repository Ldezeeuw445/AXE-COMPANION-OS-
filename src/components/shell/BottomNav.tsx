"use client";

/**
 * SkeuNavBar — floating pill navbar at the bottom of the screen.
 *
 * Position is set via JS after reading the computed safe-area-inset-bottom,
 * so there's never a position jump on first load.
 *
 * Glass bubble: when the user swipes content left/right, a translucent
 * cyan bubble slides across the navbar tabs (like Slack).
 */

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Clock,
  LineChart,
  MessageSquare,
  Repeat2,
  Settings,
  Star,
} from "lucide-react";
import { useAmbient } from "@/components/ambient/AmbientProvider";
import { useSwipeNav } from "./SwipeNavContext";

const CYAN = "#00d4f5";
const GOLD = "#d4af37";

const CORE_TABS = [
  { href: "/chat",       label: "AXE",     Icon: MessageSquare },
  { href: "/watchlist",  label: "Quotes",  Icon: BarChart3 },
  { href: "/chart",      label: "Chart",   Icon: LineChart },
  { href: "/positions",  label: "Trade",   Icon: Repeat2 },
  { href: "/history",    label: "History",  Icon: Clock },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  const { playSound, vibrate } = useAmbient();
  const navRef = useRef<HTMLElement>(null);
  const isAxeView = pathname === "/chat" || pathname.startsWith("/chat/");

  const { progress, currentTabIdx } = useSwipeNav();

  /* ── Stable position via JS ─────────────────────────────────
     Read the computed safe-area-inset-bottom once on mount
     (after iOS has resolved it) and lock it. No more async
     CSS env() jumps. */
  const [bottomPx, setBottomPx] = useState<number | null>(null);

  useEffect(() => {
    function readSafeArea() {
      const el = document.documentElement;
      const raw = getComputedStyle(el).getPropertyValue("--sab")?.trim();
      if (raw) {
        const px = parseFloat(raw);
        if (!Number.isNaN(px)) { setBottomPx(px + 4); return; }
      }
      // Fallback: read env() via a probe element
      const probe = document.createElement("div");
      probe.style.cssText = "position:fixed;bottom:env(safe-area-inset-bottom,0px);visibility:hidden;pointer-events:none;height:0;";
      document.body.appendChild(probe);
      // Give iOS a frame to compute
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const rect = probe.getBoundingClientRect();
          const viewH = window.innerHeight;
          const safeBottom = viewH - rect.bottom;
          setBottomPx(Math.max(0, safeBottom) + 4);
          probe.remove();
        });
      });
    }
    readSafeArea();
  }, []);

  // Conditional 6th tab
  const sixthTab = isAxeView
    ? { href: "/upgrade",  label: "Upgrade",  Icon: Star,     accent: GOLD }
    : { href: "/settings", label: "Settings", Icon: Settings, accent: undefined };

  const tabs = [...CORE_TABS.map((t) => ({ ...t, accent: undefined as string | undefined })), sixthTab];

  /* ── Glass bubble ──────────────────────────────────────────── */
  const isSwiping = Math.abs(progress) > 0.05;
  const fractionalIdx = currentTabIdx + progress;

  // Don't render until JS has measured the safe area
  if (bottomPx === null) return null;

  return (
    <nav
      ref={navRef}
      className="tos-nav-pill pointer-events-auto"
      style={{
        bottom: bottomPx,
        background: "linear-gradient(180deg, #131318 0%, #0a0a0e 100%)",
        borderRadius: "9999px",
        boxShadow:
          "0 8px 32px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.06) inset, 0 1px 0 rgba(255,255,255,0.04) inset",
        padding: "6px 4px",
      }}
      aria-label="Primary"
    >
      {/* Inner glow highlight along top edge */}
      <div
        className="pointer-events-none absolute inset-x-4 top-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 30%, rgba(255,255,255,0.10) 50%, rgba(255,255,255,0.08) 70%, transparent 100%)",
        }}
      />

      {/* Glassmorphism swipe bubble */}
      {isSwiping && (
        <div
          className="pointer-events-none absolute z-0"
          style={{
            left: `calc(${(fractionalIdx + 0.5) / tabs.length * 100}% - 28px)`,
            top: 3,
            width: 56,
            height: "calc(100% - 6px)",
            borderRadius: 16,
            background: "rgba(0, 212, 245, 0.08)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: "1px solid rgba(0, 212, 245, 0.15)",
            boxShadow: "0 0 20px rgba(0, 212, 245, 0.12), inset 0 0 12px rgba(0, 212, 245, 0.06)",
            transition: "left 0.05s linear",
          }}
        />
      )}

      <div className="relative z-10 flex items-center justify-around">
        {tabs.map(({ href, label, Icon, accent }, idx) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          const bubbleOver = isSwiping && Math.abs(fractionalIdx - idx) < 0.6;
          const color = active ? (accent ?? CYAN) : undefined;

          return (
            <Link
              key={href}
              href={href}
              onClick={() => {
                vibrate("light");
                playSound("tap");
              }}
              className="group relative flex flex-col items-center gap-[2px] active:scale-95 transition-transform"
              style={{ minWidth: 0, flex: "1 1 0%" }}
            >
              {/* Icon well */}
              <div
                className="relative flex h-[38px] w-[38px] items-center justify-center rounded-xl transition-all duration-150"
                style={
                  active
                    ? {
                        boxShadow: `inset 2px 2px 5px rgba(0,0,0,0.7), inset -1px -1px 3px rgba(255,255,255,0.04), 0 0 8px ${color}33`,
                        background: "rgba(255,255,255,0.03)",
                      }
                    : bubbleOver
                      ? {
                          boxShadow: `inset 2px 2px 5px rgba(0,0,0,0.5), inset -1px -1px 3px rgba(255,255,255,0.04), 0 0 12px ${CYAN}22`,
                          background: "rgba(0, 212, 245, 0.06)",
                        }
                      : {
                          boxShadow:
                            "inset 3px 3px 6px rgba(0,0,0,0.5), inset -2px -2px 4px rgba(255,255,255,0.03)",
                          background: "rgba(255,255,255,0.015)",
                        }
                }
              >
                <Icon
                  className="h-[18px] w-[18px] transition-colors duration-200"
                  style={{
                    color: active
                      ? color
                      : bubbleOver
                        ? "rgba(0, 212, 245, 0.55)"
                        : "rgba(255,255,255,0.25)",
                  }}
                  strokeWidth={active ? 2 : 1.5}
                  aria-hidden
                />

                {/* Active cyan (or gold) glow dot */}
                {active && (
                  <span
                    className="absolute -bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full"
                    style={{
                      background: color,
                      boxShadow: `0 0 6px ${color}, 0 0 12px ${color}66`,
                    }}
                  />
                )}
              </div>

              {/* Label */}
              <span
                className="text-[7px] font-medium tracking-[0.06em] uppercase transition-colors duration-200"
                style={{
                  color: active
                    ? color
                    : bubbleOver
                      ? "rgba(0, 212, 245, 0.45)"
                      : "rgba(255,255,255,0.22)",
                }}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
