"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Clock,
  LineChart,
  MessageSquare,
  Repeat2,
  Settings,
} from "lucide-react";
import { useAmbient } from "@/components/ambient/AmbientProvider";

/**
 * Primary bottom nav — 6 tabs matching MT5 layout + AXE.
 * Quotes · Chart · Trade · AXE · History · Settings
 *
 * Skeuomorph depth inspired by heartbeat.ua dark-mode banking:
 * - Raised dock with inner top highlight + deep drop shadow
 * - Active tab emits a soft colored glow that "illuminates" the bar surface
 * - Inactive icons are deeply recessed (very dim)
 * - Plays a tap sound on switch (when sound-fx enabled)
 */
const TABS = [
  { href: "/watchlist", label: "Quotes",   Icon: BarChart3,       accentVar: "--icon-accounts" },
  { href: "/chart",     label: "Chart",    Icon: LineChart,       accentVar: "--icon-chat" },
  { href: "/positions", label: "Trade",    Icon: Repeat2,         accentVar: "--icon-long" },
  { href: "/chat",      label: "AXE",      Icon: MessageSquare,   accentVar: "--icon-chat" },
  { href: "/history",   label: "History",  Icon: Clock,           accentVar: "--icon-intel" },
  { href: "/settings",  label: "Settings", Icon: Settings,        accentVar: "--icon-news" },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  const { playSound, vibrate } = useAmbient();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 px-2 pb-[env(safe-area-inset-bottom)]"
      aria-label="Primary"
    >
      <div className="tos-bottom-nav mx-auto max-w-lg">
        {/* Top edge highlight — simulates light catching the raised surface */}
        <div className="pointer-events-none absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

        <div className="flex items-center justify-around py-1">
          {TABS.map(({ href, label, Icon, accentVar }) => {
            const active =
              pathname === href || pathname.startsWith(`${href}/`);

            const accentColor = `var(${accentVar})`;

            return (
              <Link
                key={href}
                href={href}
                onClick={() => { vibrate("light"); playSound("tap"); }}
                className={`group relative flex flex-col items-center gap-px rounded-md px-2 py-1 text-[8.5px] font-medium tracking-wide transition-all duration-200 ${
                  active
                    ? "text-white"
                    : "text-[var(--tos-text-dim)] hover:text-[var(--tos-text-muted)]"
                }`}
              >
                {/* Active glow — larger, softer halo that illuminates the bar */}
                {active ? (
                  <>
                    {/* Outer diffuse glow */}
                    <span
                      className="absolute -top-1 left-1/2 h-8 w-8 -translate-x-1/2 rounded-full opacity-[0.12] blur-xl"
                      style={{ background: accentColor }}
                    />
                    {/* Inner concentrated glow */}
                    <span
                      className="absolute -top-0.5 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full opacity-25 blur-md"
                      style={{ background: accentColor }}
                    />
                    {/* Dot indicator below icon */}
                    <span
                      className="absolute -bottom-0.5 left-1/2 h-[3px] w-[3px] -translate-x-1/2 rounded-full"
                      style={{ background: accentColor, boxShadow: `0 0 6px ${accentColor}` }}
                    />
                  </>
                ) : null}

                <Icon
                  className="relative h-[17px] w-[17px] transition-colors duration-200"
                  style={active ? { color: accentColor } : undefined}
                  strokeWidth={active ? 2 : 1.5}
                  aria-hidden
                />
                <span
                  className={`relative transition-colors duration-200 ${
                    active ? "" : "opacity-50"
                  }`}
                  style={active ? { color: accentColor } : undefined}
                >
                  {label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
