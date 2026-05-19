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
 * Visible on all pages EXCEPT /chart and /chat (full-screen experiences).
 * Linear-inspired: monochrome idle, accent only on active tab.
 */
const TABS = [
  { href: "/chart", label: "Chart", Icon: LineChart, accentVar: "--icon-chat" },
  { href: "/watchlist", label: "Watchlist", Icon: BarChart3, accentVar: "--icon-accounts" },
  { href: "/chat", label: "AXE", Icon: MessageSquare, accentVar: "--icon-chat" },
  { href: "/intel", label: "Intel", Icon: Target, accentVar: "--icon-intel" },
  { href: "/market", label: "Market", Icon: Sparkles, accentVar: "--icon-news" },
] as const;

/** Pages where the bottom nav is hidden (full-screen UX). */
const HIDDEN_ROUTES = ["/chart", "/chat"];

export function BottomNav() {
  const pathname = usePathname();

  const shouldHide = HIDDEN_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  if (shouldHide) return null;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1"
      aria-label="Primary"
    >
      <div className="tos-bottom-nav mx-auto max-w-md">
        <div className="flex items-center justify-around px-2 py-2">
          {TABS.map(({ href, label, Icon, accentVar }) => {
            const active =
              pathname === href || pathname.startsWith(`${href}/`);

            const accentColor = `var(${accentVar})`;

            return (
              <Link
                key={href}
                href={href}
                className={`group relative flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-[10px] font-medium tracking-wide transition-colors duration-200 ${
                  active
                    ? "text-white"
                    : "text-[var(--tos-text-dim)] hover:text-[var(--tos-text-muted)]"
                }`}
              >
                {/* Active indicator — subtle top line */}
                {active ? (
                  <span
                    className="absolute -top-0.5 left-1/2 h-[2px] w-4 -translate-x-1/2 rounded-full"
                    style={{ background: accentColor }}
                  />
                ) : null}

                <Icon
                  className="h-5 w-5 transition-colors duration-200"
                  style={active ? { color: accentColor } : undefined}
                  strokeWidth={active ? 2 : 1.5}
                  aria-hidden
                />
                <span
                  className={`transition-colors duration-200 ${
                    active ? "" : "opacity-60"
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
