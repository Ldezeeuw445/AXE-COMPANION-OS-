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
import { useTabletNavCollapse, useTabletNavSwipe } from "@/components/shell/TabletNavCollapse";
import { FeedNavBadge } from "@/components/feed/FeedNavBadge";
import { useShellStatus } from "@/components/shell/useShellStatus";
import type { RuntimeTruthState } from "@/lib/runtime/runtimeTruth";

const CYAN = "#00d4f5";

/** How each live-data state paints the nav's top edge. */
const RUNTIME_LINE: Record<RuntimeTruthState, { background: string; opacity: number }> = {
  live: {
    background: "linear-gradient(90deg, rgba(201,242,75,0.55) 0%, rgba(63,230,207,0.9) 50%, rgba(122,87,255,0.55) 100%)",
    opacity: 1,
  },
  degraded: {
    background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.28) 50%, transparent 100%)",
    opacity: 1,
  },
  warming: {
    background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.18) 50%, transparent 100%)",
    opacity: 1,
  },
  unavailable: {
    background: "linear-gradient(90deg, rgba(201,138,43,0.4) 0%, rgba(240,178,74,0.85) 50%, rgba(201,138,43,0.4) 100%)",
    opacity: 1,
  },
  inactive: {
    background:
      "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 30%, rgba(255,255,255,0.10) 50%, rgba(255,255,255,0.08) 70%, transparent 100%)",
    opacity: 1,
  },
};

/** Same shape as the feed badge so the three read as one family. */
function NavBadge({ count, className, label }: { count: number; className: string; label: string }) {
  return (
    <span
      className={`absolute -right-0.5 -top-0.5 flex h-3.5 min-w-[0.875rem] items-center justify-center rounded-full px-0.5 text-[7px] font-bold text-black ${className}`}
      aria-label={label}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}
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
  const {
    enabled: navCollapsible,
    collapsed: navCollapsed,
    collapse: collapseNav,
    expand: expandNav,
  } = useTabletNavCollapse();
  const navSwipe = useTabletNavSwipe("collapse", collapseNav);
  const shell = useShellStatus();
  const expandSwipe = useTabletNavSwipe("expand", expandNav);

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
      className={`tos-nav-pill tos-shell-mobile-nav pointer-events-auto ${navCollapsible ? "tos-tablet-nav-pill" : ""} ${navCollapsed ? "tos-nav-pill-rail" : ""}`}
      style={{
        // Matches the composer card above it — same gradient, radius and shadow.
        background: "linear-gradient(180deg, #131317 0%, #0b0b0e 100%)",
        borderRadius: 26,
        boxShadow: "0 12px 40px rgba(0,0,0,0.55)",
        WebkitTextSizeAdjust: "100%",
      }}
      aria-label="Primary"
      {...(navCollapsible ? navSwipe : {})}
    >
      {navCollapsible && !navCollapsed ? (
        // Absolutely placed so the affordance costs the bar no height: a
        // hairline on the top edge with a finger-sized hit area behind it.
        <button
          type="button"
          onClick={collapseNav}
          aria-label="Hide navigation"
          className="group absolute inset-x-0 top-0 z-20 flex h-4 -translate-y-1 justify-center pt-1"
          {...navSwipe}
        >
          <span className="h-[3px] w-9 rounded-full bg-white/15 transition-colors group-active:bg-white/35" />
        </button>
      ) : null}

      {/* Top edge doubles as the live-data readout. AXE gradient when broker
          ticks are arriving, dimmed when the stream has fallen back to
          candles, amber when the account is unreachable, and the old neutral
          highlight when there is no account to report on. */}
      <div
        className="pointer-events-none absolute inset-x-4 top-[1px] h-px transition-opacity duration-500"
        style={{ background: RUNTIME_LINE[shell.runtime].background, opacity: RUNTIME_LINE[shell.runtime].opacity }}
        aria-hidden
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

      {navCollapsed ? (
        <button
          type="button"
          onClick={expandNav}
          aria-label="Show navigation"
          aria-expanded={false}
          className="relative z-10 flex w-full items-center justify-center py-[3px] active:scale-[0.98]"
          {...expandSwipe}
        >
          <span
            className="h-[3px] w-16 rounded-full"
            style={{
              background:
                "linear-gradient(90deg, rgba(201,242,75,0.55) 0%, rgba(63,230,207,0.75) 52%, rgba(122,87,255,0.55) 100%)",
            }}
          />
        </button>
      ) : (
      <div className="relative z-10 flex items-center justify-around gap-1">
        {tabs.map(({ href, label, Icon, accent }, idx) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          const bubbleOver = isSwiping && Math.abs(fractionalIdx - idx) < 0.6;
          const color = active ? (accent ?? CYAN) : undefined;

          return (
            <Link
              key={href}
              href={href}
              onClick={(e) => {
                vibrate("light");
                playSound("tap");
                if (href === "/chat" && active) {
                  e.preventDefault();
                  window.dispatchEvent(new CustomEvent("axe:chat-scroll-top"));
                }
              }}
              className="group relative flex flex-col items-center gap-[2px] active:scale-95 transition-transform"
              style={{ minWidth: 0, flex: "1 1 0%" }}
            >
              {href === "/chat" ? <FeedNavBadge /> : null}
              {href === "/chart" && shell.alertsTriggered > 0 ? (
                <NavBadge
                  count={shell.alertsTriggered}
                  className="bg-[#f0b24a]"
                  label={`${shell.alertsTriggered} alerts triggered in the last 24 hours`}
                />
              ) : null}
              {href === "/positions" && shell.positions != null && shell.positions > 0 ? (
                <NavBadge
                  count={shell.positions}
                  className="bg-[#C9F24B]"
                  label={`${shell.positions} open positions`}
                />
              ) : null}
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
      )}
    </nav>
  );
}
