"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { CSSProperties } from "react";
import {
  Bell,
  BookOpen,
  Brain,
  Briefcase,
  Landmark,
  MessageSquare,
  Newspaper,
  ScrollText,
  Settings,
  Target,
  Vault,
} from "lucide-react";

const items = [
  { href: "/accounts", label: "Accounts", Icon: Landmark, accentVar: "--icon-accounts" },
  { href: "/history", label: "History", Icon: ScrollText, accentVar: "--icon-history" },
  { href: "/journal", label: "Journal", Icon: BookOpen, accentVar: "--icon-journal" },
  { href: "/chat", label: "Chat", Icon: MessageSquare, accentVar: "--icon-chat" },
  { href: "/intel", label: "Intel", Icon: Target, accentVar: "--icon-intel" },
  { href: "/market", label: "News", Icon: Newspaper, accentVar: "--icon-news" },
  { href: "/alerts", label: "Alerts", Icon: Bell, accentVar: "--icon-alerts" },
  { href: "/vault", label: "Vault", Icon: Vault, accentVar: "--icon-vault" },
  {
    href: "/actions",
    label: "Actions",
    Icon: Briefcase,
    accentVar: "--icon-actions",
  },
  { href: "/cockpit", label: "Cockpit", Icon: Brain, accentVar: "--icon-cockpit" },
  {
    href: "/settings",
    label: "Settings",
    Icon: Settings,
    accentVar: "--icon-settings",
  },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  const [hoveredHref, setHoveredHref] = useState<string | null>(null);

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 px-3 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-2 md:hidden"
      aria-label="Primary"
    >
      <div className="mx-auto max-w-lg rounded-[1.35rem] border border-white/[0.09] bg-gradient-to-b from-tos-surface-928/70 to-tos-bg/75 shadow-[0_8px_28px_rgba(0,0,0,0.48),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl" style={{backdropFilter: "blur(28px) saturate(160%)", WebkitBackdropFilter: "blur(28px) saturate(160%)"}}>
        <div className="flex gap-0.5 overflow-x-auto px-1 py-2 tos-nav-scroll">
          {items.map(({ href, label, Icon, accentVar }) => {
            const active =
              pathname === href || pathname.startsWith(`${href}/`);
            const hovered = hoveredHref === href && !active;

            const accentColor = `var(${accentVar})`;

            const navStyle: CSSProperties = {
              ["--nav-accent" as string]: accentColor,
              ...(hovered
                ? {
                    background: `color-mix(in srgb, ${accentColor} 11%, transparent)`,
                    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.05), 0 0 12px color-mix(in srgb, ${accentColor} 20%, transparent)`,
                    color: accentColor,
                  }
                : {}),
            };

            return (
              <Link
                key={href}
                href={href}
                style={navStyle}
                onMouseEnter={() => setHoveredHref(href)}
                onMouseLeave={() => setHoveredHref(null)}
                className={`flex min-w-[3.25rem] shrink-0 flex-col items-center gap-0.5 rounded-xl px-1.5 py-1.5 text-[10px] font-medium tracking-wide transition-all duration-150 ${
                  active
                    ? "tos-nav-pill-active"
                    : hovered
                      ? ""
                      : "tos-nav-pill-idle text-tos-dim"
                }`}
              >
                <Icon
                  className="h-5 w-5 transition-colors duration-150"
                  style={
                    active || hovered ? { color: accentColor } : undefined
                  }
                  strokeWidth={active ? 2.25 : hovered ? 2 : 1.65}
                  aria-hidden
                />
                {label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
