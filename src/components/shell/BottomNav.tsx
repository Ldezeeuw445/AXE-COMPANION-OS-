"use client";

/**
 * SkeuNavBar — bottom navigation carved into brushed metal.
 *
 * Background: linear-gradient(180deg, #101016, #0a0a0e).
 * Icon wells: 40×40 px, border-radius 12 px, inset shadows.
 * Active tab: deeper inset + cyan glow dot (4 px, #00d4f5).
 *
 * Tabs: Quotes · Chart · Trade · AXE · History + conditional 6th:
 *   – AXE view  → Upgrade (gold star ★ #d4af37)
 *   – Otherwise → Settings (gear)
 *
 * Label: 8 px uppercase, letter-spacing 0.06 em.
 */

import { useRef, useLayoutEffect, useCallback } from "react";
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

const CYAN = "#00d4f5";
const GOLD = "#d4af37";

const CORE_TABS = [
  { href: "/watchlist",  label: "Quotes",  Icon: BarChart3 },
  { href: "/chart",      label: "Chart",   Icon: LineChart },
  { href: "/positions",  label: "Trade",   Icon: Repeat2 },
  { href: "/chat",       label: "AXE",     Icon: MessageSquare },
  { href: "/history",    label: "History",  Icon: Clock },
] as const;

/**
 * Probe the *real* env(safe-area-inset-bottom) from a disposable hidden
 * element.  We can't read it from BottomNav itself because our inline
 * style override (paddingBottom: Npx) masks the CSS env() value.
 */
function probeSafeAreaBottom(): number {
  const d = document.createElement("div");
  d.style.cssText =
    "position:fixed;bottom:0;left:0;width:0;height:0;" +
    "padding-bottom:env(safe-area-inset-bottom);" +
    "visibility:hidden;pointer-events:none";
  document.body.appendChild(d);
  const v = parseFloat(getComputedStyle(d).paddingBottom) || 0;
  d.remove();
  return v;
}

export function BottomNav() {
  const pathname = usePathname();
  const { playSound, vibrate } = useAmbient();
  const navRef = useRef<HTMLElement>(null);
  const safeBottomRef = useRef(0);
  const isAxeView = pathname === "/chat" || pathname.startsWith("/chat/");

  // ── Sync safe-area padding ──────────────────────────────────────────
  // Reads env(safe-area-inset-bottom) from a probe element (not the nav
  // itself, whose inline style would mask the CSS value).  Keeps the MAX
  // value ever observed so the nav never jumps smaller.
  const syncSafeArea = useCallback(() => {
    const el = navRef.current;
    if (!el) return;
    const env = probeSafeAreaBottom();
    const best = Math.max(env, safeBottomRef.current, 20);
    if (best !== safeBottomRef.current) {
      safeBottomRef.current = best;
      el.style.paddingBottom = `${best}px`;
    }
  }, []);

  // Re-probe on every navigation — some pages trigger different iOS
  // safe-area resolution depending on scroll state.
  useLayoutEffect(() => {
    syncSafeArea();
  }, [pathname, syncSafeArea]);

  // On mount, poll for a few frames in case env() hasn't resolved yet.
  // iOS can take 1-3 frames after first paint to report the real value.
  useLayoutEffect(() => {
    let raf = 0;
    let attempts = 0;
    const poll = () => {
      const env = probeSafeAreaBottom();
      if (env > safeBottomRef.current) {
        safeBottomRef.current = env;
        if (navRef.current) {
          navRef.current.style.paddingBottom = `${env}px`;
        }
      }
      // Keep polling until env resolves (>0) or we've tried ~1 second
      if (env === 0 && attempts < 60) {
        attempts++;
        raf = requestAnimationFrame(poll);
      }
    };
    raf = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ── ResizeObserver for --tos-nav-h / --tos-nav-offset ────────────────
  useLayoutEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const sync = () => {
      const total = el.offsetHeight;
      const pb = safeBottomRef.current || 20;
      const navH = total - pb;
      if (navH > 0) {
        document.documentElement.style.setProperty("--tos-nav-h", `${navH}px`);
        document.documentElement.style.setProperty("--tos-nav-offset", `${total}px`);
      }
    };
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    sync();
    return () => ro.disconnect();
  }, []);

  // Conditional 6th tab
  const sixthTab = isAxeView
    ? { href: "/upgrade",  label: "Upgrade",  Icon: Star,     accent: GOLD }
    : { href: "/settings", label: "Settings", Icon: Settings, accent: undefined };

  const tabs = [...CORE_TABS.map((t) => ({ ...t, accent: undefined as string | undefined })), sixthTab];

  return (
    <nav
      ref={navRef}
      className="fixed bottom-0 left-0 right-0 z-50"
      style={{
        background: "linear-gradient(180deg, #101016, #0a0a0e)",
        paddingBottom: "max(env(safe-area-inset-bottom), 20px)",
      }}
      aria-label="Primary"
    >
      {/* Top edge — subtle bevel highlight */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />

      <div className="mx-auto flex max-w-lg items-center justify-around px-1 py-1.5">
        {tabs.map(({ href, label, Icon, accent }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          const color = active ? (accent ?? CYAN) : undefined;

          return (
            <Link
              key={href}
              href={href}
              onClick={() => {
                vibrate("light");
                playSound("tap");
              }}
              className="group relative flex flex-col items-center gap-[3px] active:scale-95 transition-transform"
            >
              {/* Icon well */}
              <div
                className="relative flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-150"
                style={
                  active
                    ? {
                        boxShadow: `inset 2px 2px 5px rgba(0,0,0,0.7), inset -1px -1px 3px rgba(255,255,255,0.04), 0 0 8px ${color}33`,
                        background: "rgba(255,255,255,0.03)",
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
                  style={{ color: active ? color : "rgba(255,255,255,0.25)" }}
                  strokeWidth={active ? 2 : 1.5}
                  aria-hidden
                />

                {/* Active cyan (or gold) glow dot */}
                {active && (
                  <span
                    className="absolute -bottom-1.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full"
                    style={{
                      background: color,
                      boxShadow: `0 0 6px ${color}, 0 0 12px ${color}66`,
                    }}
                  />
                )}
              </div>

              {/* Label */}
              <span
                className="text-[8px] font-medium tracking-[0.06em] uppercase transition-colors duration-200"
                style={{ color: active ? color : "rgba(255,255,255,0.22)" }}
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
