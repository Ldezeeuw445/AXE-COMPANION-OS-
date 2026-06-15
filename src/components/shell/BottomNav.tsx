"use client";

/**
 * SkeuNavBar — docked bottom tab bar.
 *
 * position:fixed via CSS (.tos-nav-pill) — always at the bottom.
 * Safe-area padding-bottom in CSS so background extends to screen edge.
 * Top corners rounded (16px), bottom edge flush.
 *
 * Glass bubble: when the user swipes content left/right, a translucent
 * cyan bubble slides across the navbar tabs (like Slack).
 */

import { useRef, useEffect } from "react";
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

  // iOS can report stale safe-area after chart landscape → portrait; force a reflow.
  useEffect(() => {
    let settleTimer: ReturnType<typeof setTimeout> | null = null;

    function settleNav() {
      if (document.body.classList.contains("chart-landscape-active")) return;
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        window.scrollTo(0, 0);
        settleTimer = null;
      }, 180);
    }

    window.addEventListener("orientationchange", settleNav);
    return () => {
      if (settleTimer) clearTimeout(settleTimer);
      window.removeEventListener("orientationchange", settleNav);
    };
  }, []);

  const { progress, currentTabIdx } = useSwipeNav();

  // Conditional 6th tab
  const sixthTab = isAxeView
    ? { href: "/upgrade",  label: "Upgrade",  Icon: Star,     accent: GOLD }
    : { href: "/settings", label: "Settings", Icon: Settings, accent: undefined };

  const tabs = [...CORE_TABS.map((t) => ({ ...t, accent: undefined as string | undefined })), sixthTab];

  /* ── Glass bubble ──────────────────────────────────────────── */
  const isSwiping = Math.abs(progress) > 0.05;
  const fractionalIdx = currentTabIdx + progress;

  return (
    <nav
      ref={navRef}
      className="tos-nav-pill tos-shell-mobile-nav pointer-events-auto"
      style={{
        background: "linear-gradient(180deg, rgba(22,22,24,0.86) 0%, rgba(12,12,14,0.9) 100%)",
        borderRadius: 22,
        boxShadow:
          "0 14px 34px rgba(0,0,0,0.56), 0 0 0 1px rgba(255,255,255,0.08) inset, 0 1px 0 rgba(255,255,255,0.06) inset",
        WebkitTextSizeAdjust: "100%",
      }}
      aria-label="Primary"
    >
      {/* Inner glow highlight along top edge */}
      <div
        className="pointer-events-none absolute inset-x-4 top-[1px] h-px"
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
            top: 2,
            width: 56,
            height: "calc(100% - 8px)",
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

      <div className="relative z-10 flex items-center justify-around gap-1">
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
                className="relative flex h-[var(--tos-nav-icon-size)] w-[var(--tos-nav-icon-size)] items-center justify-center rounded-[10px] transition-all duration-150"
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
                  className="h-[var(--tos-nav-icon-glyph-size)] w-[var(--tos-nav-icon-glyph-size)] transition-colors duration-200"
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

                {/* Active dot removed — cleaner look */}
              </div>

              {/* Label */}
              <span
                className="font-medium tracking-[0.07em] uppercase transition-colors duration-200"
                style={{
                  color: active
                    ? color
                    : bubbleOver
                      ? "rgba(0, 212, 245, 0.45)"
                      : "rgba(255,255,255,0.22)",
                  fontSize: "var(--tos-nav-label-size, 6px)",
                  lineHeight: "1.05",
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
