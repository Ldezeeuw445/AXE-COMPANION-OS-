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

/**
 * Primary bottom nav — 6 tabs matching MT5 layout + AXE.
 * Quotes · Chart · Trade · AXE · History · Settings
 * Always visible on mobile. Slim premium frosted glass dock.
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

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 px-2 pb-[env(safe-area-inset-bottom)]"
      aria-label="Primary"
    >
      <div className="tos-bottom-nav mx-auto max-w-lg">
        <div className="flex items-center justify-around py-1">
          {TABS.map(({ href, label, Icon, accentVar }) => {
            const active =
              pathname === href || pathname.startsWith(`${href}/`);

            const accentColor = `var(${accentVar})`;

            return (
              <Link
                key={href}
                href={href}
                className={`group relative flex flex-col items-center gap-px rounded-md px-2 py-1 text-[8.5px] font-medium tracking-wide transition-all duration-200 ${
                  active
                    ? "text-white"
                    : "text-[var(--tos-text-dim)] hover:text-[var(--tos-text-muted)]"
                }`}
              >
                {/* Active glow behind icon */}
                {active ? (
                  <span
                    className="absolute -top-0.5 left-1/2 h-4 w-4 -translate-x-1/2 rounded-full opacity-20 blur-md"
                    style={{ background: accentColor }}
                  />
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
