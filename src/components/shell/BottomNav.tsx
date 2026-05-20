"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  LineChart,
  MessageSquare,
  Target,
  Sparkles,
} from "lucide-react";

/**
 * Primary bottom nav — 5 core tabs.
 * Always visible on mobile (MT5-style). Slim, premium frosted glass dock.
 */
const TABS = [
  { href: "/chart", label: "Chart", Icon: LineChart, accentVar: "--icon-chat" },
  { href: "/watchlist", label: "Watchlist", Icon: BarChart3, accentVar: "--icon-accounts" },
  { href: "/chat", label: "AXE", Icon: MessageSquare, accentVar: "--icon-chat" },
  { href: "/intel", label: "Intel", Icon: Target, accentVar: "--icon-intel" },
  { href: "/market", label: "Market", Icon: Sparkles, accentVar: "--icon-news" },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 px-3 pb-[env(safe-area-inset-bottom)]"
      aria-label="Primary"
    >
      <div className="tos-bottom-nav mx-auto max-w-md">
        <div className="flex items-center justify-around py-1.5">
          {TABS.map(({ href, label, Icon, accentVar }) => {
            const active =
              pathname === href || pathname.startsWith(`${href}/`);

            const accentColor = `var(${accentVar})`;

            return (
              <Link
                key={href}
                href={href}
                className={`group relative flex flex-col items-center gap-px rounded-lg px-3 py-1 text-[9px] font-medium tracking-wide transition-all duration-200 ${
                  active
                    ? "text-white"
                    : "text-[var(--tos-text-dim)] hover:text-[var(--tos-text-muted)]"
                }`}
              >
                {/* Active glow behind icon */}
                {active ? (
                  <span
                    className="absolute -top-0.5 left-1/2 h-5 w-5 -translate-x-1/2 rounded-full opacity-25 blur-md"
                    style={{ background: accentColor }}
                  />
                ) : null}

                <Icon
                  className="relative h-[18px] w-[18px] transition-colors duration-200"
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
