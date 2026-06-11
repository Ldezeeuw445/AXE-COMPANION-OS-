"use client";

/**
 * SkeuNavBar — docked bottom tab bar.
 *
 * Pinned to bottom: 0 with safe-area padding inside so icons clear the
 * home indicator. Top corners rounded (16px), bottom edge flush with screen.
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

  // iOS PWA: env(safe-area-inset-bottom) can resolve asynchronously on
  // first launch — the CSS value is 0 during the initial paint, then
  // jumps to the real value ~50-100ms later. We measure it via JS and
  // re-trigger a render so the bar never floats above its final position.
  const [safeBottom, setSafeBottom] = useState<number | null>(null);
  useEffect(() => {
    function measure() {
      const el = document.createElement("div");
      el.style.cssText =
        "position:fixed;bottom:0;left:0;width:0;height:env(safe-area-inset-bottom,0px);pointer-events:none;visibility:hidden";
      document.body.appendChild(el);
      const h = el.getBoundingClientRect().height;
      document.body.removeChild(el);
      return h;
    }
    // First read — might be 0 on iOS PWA cold start
    const first = measure();
    setSafeBottom(first);
    // Re-measure after a short delay in case iOS resolves the inset late
    const t = setTimeout(() => {
      const second = measure();
      if (second !== first) setSafeBottom(second);
    }, 150);
    return () => clearTimeout(t);
  }, []);

  // iOS PWA cold-start fix: verify the navbar is actually flush with the
  // viewport bottom. On some iOS versions, `position: fixed; bottom: 0`
  // can be offset when the page first loads (especially on fullscreen-page
  // routes like /chat). We detect the discrepancy via getBoundingClientRect
  // and nudge the bottom property until the nav is flush.
  const [bottomCorrection, setBottomCorrection] = useState(0);
  useEffect(() => {
    if (!navRef.current) return;

    function verify() {
      const nav = navRef.current;
      if (!nav) return;
      // Temporarily reset correction so we measure the "native" position
      const prevBottom = nav.style.bottom;
      nav.style.bottom = "0px";
      const rect = nav.getBoundingClientRect();
      const viewH = window.visualViewport?.height ?? window.innerHeight;
      // gap > 0 means nav is floating above the bottom
      const gap = viewH - rect.bottom;
      if (Math.abs(gap) > 2) {
        // Apply negative bottom to push the nav down into the gap
        const fix = Math.max(-40, Math.min(40, Math.round(-gap)));
        nav.style.bottom = `${fix}px`;
        setBottomCorrection(fix);
      } else {
        nav.style.bottom = prevBottom === "0px" || !prevBottom ? "" : prevBottom;
        setBottomCorrection(0);
      }
    }

    // Check on mount + after short delay (iOS env() async resolve)
    const raf = requestAnimationFrame(verify);
    const t1 = setTimeout(verify, 250);
    const t2 = setTimeout(verify, 600);

    // Re-check on viewport resize (keyboard, rotation, etc.)
    const vv = window.visualViewport;
    if (vv) vv.addEventListener("resize", verify);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t1);
      clearTimeout(t2);
      if (vv) vv.removeEventListener("resize", verify);
    };
  }, [pathname]); // re-run when route changes

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
      className="tos-nav-pill pointer-events-auto"
      style={{
        background: "#111115",
        borderRadius: "16px 16px 0 0",
        boxShadow:
          "0 -4px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06) inset, 0 1px 0 rgba(255,255,255,0.04) inset",
        paddingTop: 4,
        paddingLeft: 4,
        paddingRight: 4,
        /* Safe-area padding. JS-measured value takes priority so the bar
           never floats higher than intended on iOS PWA cold start (where
           the CSS env() value can resolve asynchronously). */
        paddingBottom:
          safeBottom != null && safeBottom > 0
            ? safeBottom
            : "env(safe-area-inset-bottom, 0px)",
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
            top: 2,
            width: 56,
            height: "calc(100% - 4px - env(safe-area-inset-bottom, 0px))",
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
