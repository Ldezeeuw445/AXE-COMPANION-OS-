"use client";

/**
 * SkeuNavBar — floating pill navbar at the bottom of the screen.
 *
 * Floating pill shape: fully rounded sides (border-radius 9999px).
 * Background: linear-gradient(180deg, #101016, #0a0a0e).
 * Icon wells: 38×38 px, border-radius 12 px, inset shadows.
 * Active tab: deeper inset + cyan glow dot (4 px, #00d4f5).
 *
 * Glassmorphism swipe: dragging horizontally across the bar moves a
 * translucent glass bubble that highlights the tab under the finger.
 * On release it snaps to the nearest tab and navigates.
 *
 * Label: 8 px uppercase, letter-spacing 0.06 em.
 */

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
  const router = useRouter();
  const { playSound, vibrate } = useAmbient();
  const navRef = useRef<HTMLElement>(null);
  const isAxeView = pathname === "/chat" || pathname.startsWith("/chat/");

  // Conditional 6th tab
  const sixthTab = isAxeView
    ? { href: "/upgrade",  label: "Upgrade",  Icon: Star,     accent: GOLD }
    : { href: "/settings", label: "Settings", Icon: Settings, accent: undefined };

  const tabs = [...CORE_TABS.map((t) => ({ ...t, accent: undefined as string | undefined })), sixthTab];

  /* ── Glassmorphism swipe state ─────────────────────────────────
     When the user drags horizontally across the navbar, a glass
     bubble follows the finger and highlights the tab underneath.
     On release, it snaps to the nearest tab and navigates. */
  const [swipeBubbleX, setSwipeBubbleX] = useState<number | null>(null);
  const swipeStartRef = useRef<{ x: number; y: number; locked: boolean } | null>(null);
  const didNavigateRef = useRef(false);

  const onNavTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    swipeStartRef.current = { x: touch.clientX, y: touch.clientY, locked: false };
    didNavigateRef.current = false;
  }, []);

  const onNavTouchMove = useCallback((e: React.TouchEvent) => {
    const start = swipeStartRef.current;
    const nav = navRef.current;
    if (!start || !nav) return;
    const touch = e.touches[0];
    if (!touch) return;

    const dx = Math.abs(touch.clientX - start.x);
    const dy = Math.abs(touch.clientY - start.y);

    // Lock intent after 8px of movement
    if (!start.locked) {
      if (dx + dy < 8) return;
      // If vertical, cancel the swipe
      if (dy > dx) {
        swipeStartRef.current = null;
        setSwipeBubbleX(null);
        return;
      }
      start.locked = true;
      vibrate("light");
    }

    // Get the finger X relative to the navbar
    const rect = nav.getBoundingClientRect();
    const relX = touch.clientX - rect.left;
    // Clamp to navbar bounds
    const clamped = Math.max(0, Math.min(relX, rect.width));
    setSwipeBubbleX(clamped);
  }, [vibrate]);

  const onNavTouchEnd = useCallback((e: React.TouchEvent) => {
    const start = swipeStartRef.current;
    const nav = navRef.current;
    if (!start || !start.locked || !nav || didNavigateRef.current) {
      swipeStartRef.current = null;
      setSwipeBubbleX(null);
      return;
    }

    const touch = e.changedTouches[0];
    if (!touch) {
      swipeStartRef.current = null;
      setSwipeBubbleX(null);
      return;
    }

    // Find which tab the finger is over
    const rect = nav.getBoundingClientRect();
    const relX = touch.clientX - rect.left;
    const tabWidth = rect.width / tabs.length;
    const tabIndex = Math.max(0, Math.min(Math.floor(relX / tabWidth), tabs.length - 1));
    const target = tabs[tabIndex];

    if (target && !(pathname === target.href || pathname.startsWith(`${target.href}/`))) {
      didNavigateRef.current = true;
      vibrate("light");
      playSound("tap");
      router.push(target.href);
    }

    swipeStartRef.current = null;
    setSwipeBubbleX(null);
  }, [tabs, pathname, router, vibrate, playSound]);

  const onNavTouchCancel = useCallback(() => {
    swipeStartRef.current = null;
    setSwipeBubbleX(null);
  }, []);

  // Calculate which tab the bubble is over (for highlight)
  const bubbleTabIndex = (() => {
    if (swipeBubbleX === null || !navRef.current) return -1;
    const rect = navRef.current.getBoundingClientRect();
    const tabWidth = rect.width / tabs.length;
    return Math.max(0, Math.min(Math.floor(swipeBubbleX / tabWidth), tabs.length - 1));
  })();

  return (
    <nav
      ref={navRef}
      className="tos-nav-pill pointer-events-auto"
      style={{
        background: "linear-gradient(180deg, #131318 0%, #0a0a0e 100%)",
        borderRadius: "9999px",
        boxShadow:
          "0 8px 32px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.06) inset, 0 1px 0 rgba(255,255,255,0.04) inset",
        padding: "6px 4px",
      }}
      aria-label="Primary"
      onTouchStart={onNavTouchStart}
      onTouchMove={onNavTouchMove}
      onTouchEnd={onNavTouchEnd}
      onTouchCancel={onNavTouchCancel}
    >
      {/* Inner glow highlight along top edge */}
      <div
        className="pointer-events-none absolute inset-x-4 top-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 30%, rgba(255,255,255,0.10) 50%, rgba(255,255,255,0.08) 70%, transparent 100%)",
        }}
      />

      {/* Glassmorphism swipe bubble — follows finger during drag */}
      {swipeBubbleX !== null && (
        <div
          className="pointer-events-none absolute z-0"
          style={{
            left: swipeBubbleX - 28,
            top: 2,
            width: 56,
            height: "calc(100% - 4px)",
            borderRadius: 16,
            background: "rgba(0, 212, 245, 0.08)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: "1px solid rgba(0, 212, 245, 0.15)",
            boxShadow: "0 0 20px rgba(0, 212, 245, 0.12), inset 0 0 12px rgba(0, 212, 245, 0.06)",
            transition: "none",
          }}
        />
      )}

      <div className="relative z-10 flex items-center justify-around">
        {tabs.map(({ href, label, Icon, accent }, idx) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          const isSwipeTarget = swipeBubbleX !== null && idx === bubbleTabIndex;
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
                    : isSwipeTarget
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
                      : isSwipeTarget
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
                    : isSwipeTarget
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
