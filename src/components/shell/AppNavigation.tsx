"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  BarChart3,
  Bell,
  BookOpen,
  Brain,
  Briefcase,
  CreditCard,
  Layers,
  LineChart,
  Menu,
  MessageSquare,
  Rss,
  ScrollText,
  Settings,
  Sparkles,
  Vault,
  X,
  Landmark,
} from "lucide-react";
import { useAppTopBarSlots } from "@/components/shell/AppTopBarContext";
import { AxeWordmarkLive } from "@/components/brand/AxeWordmarkLive";
import { AxeTriangle } from "@/components/brand/AxeTriangle";
import Image from "next/image";
import { QuickActionMenu } from "@/components/shell/QuickActionMenu";

/* ── Wrapper so AxeTriangle fits the same slot as Lucide icons ──── */
function IntelTriangleIcon({ className }: { className?: string; strokeWidth?: number }) {
  return <AxeTriangle size={20} className={className} />;
}

type NavItem = {
  href: string;
  label: string;
  Icon: typeof MessageSquare;
  /** If true, still routing but labeled coming soon in drawer */
  comingSoon?: boolean;
  /** Premium-only nav item — show lock badge */
  premium?: boolean;
};

const NAV: NavItem[] = [
  { href: "/chat", label: "Chat", Icon: MessageSquare },
  { href: "/feed", label: "AXE Feed", Icon: Rss },
  { href: "/accounts", label: "Accounts", Icon: Landmark },
  { href: "/positions", label: "Positions", Icon: Layers },
  { href: "/chart", label: "Chart", Icon: LineChart },
  { href: "/history", label: "History", Icon: ScrollText },
  { href: "/journal", label: "Journal", Icon: BookOpen },
  { href: "/watchlist", label: "Watchlist", Icon: BarChart3 },
  { href: "/intel", label: "Intel", Icon: IntelTriangleIcon as unknown as typeof MessageSquare, premium: true },
  { href: "/market", label: "Market", Icon: Sparkles },
  { href: "/alerts", label: "Alerts", Icon: Bell },
  { href: "/vault", label: "Vault", Icon: Vault },
  { href: "/actions", label: "Actions", Icon: Briefcase },
  { href: "/cockpit", label: "Cockpit", Icon: Brain },
  { href: "/upgrade", label: "Subscriptions", Icon: CreditCard },
  { href: "/settings", label: "Settings", Icon: Settings },
];

function NavLink({
  item,
  onNavigate,
  compact,
}: {
  item: NavItem;
  onNavigate?: () => void;
  compact?: boolean;
}) {
  const pathname = usePathname();
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <Link
      href={item.href}
      prefetch={item.href !== "/chart"}
      onClick={onNavigate}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
        active
          ? "bg-white/[0.07] text-white ring-1 ring-white/[0.10]"
          : "text-tos-muted hover:bg-white/[0.04] hover:text-tos-text"
      } ${compact ? "justify-center px-0 py-3" : ""}`}
      title={item.label}
    >
      <item.Icon
        className={`h-5 w-5 shrink-0 ${active ? "text-white" : "text-tos-dim"}`}
        strokeWidth={active ? 2 : 1.6}
      />
      {!compact ? (
        <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
          <span>{item.label}</span>
          {item.comingSoon ? (
            <span className="rounded border border-white/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-tos-dim">
              soon
            </span>
          ) : item.premium ? (
            <span className="rounded border border-cyan-400/20 bg-cyan-400/[0.08] px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-cyan-300/70">
              pro
            </span>
          ) : null}
        </span>
      ) : null}
    </Link>
  );
}

export function AppNavigation() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const slots = useAppTopBarSlots();
  const isChart = pathname === "/chart" || pathname.startsWith("/chart/");

  const close = useCallback(() => setOpen(false), []);
  useEffect(() => {
    queueMicrotask(() => setOpen(false));
  }, [pathname]);

  return (
    <>
      {/* Mobile top bar */}
      <div className="tos-shell-mobile-chrome sticky top-0 z-40 flex min-h-[var(--tos-topbar-h)] shrink-0 items-center justify-between border-b border-white/[0.05] bg-[var(--tos-bg-base)]/88 px-2.5 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        {/* Left — hamburger */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-white/[0.10] bg-white/[0.04] text-white/70 transition-colors hover:bg-white/[0.07] active:bg-white/[0.10]"
          aria-label="Open menu"
        >
          <Menu className="h-[16px] w-[16px]" />
        </button>

        {/* Center — chart controls OR wordmark */}
        <div className="pointer-events-none relative flex min-w-0 flex-1 items-center justify-center px-2">
          {slots.center ? (
            <div className="pointer-events-auto flex items-center justify-center">
              <div className="max-w-[min(20rem,calc(100vw-8rem))]">{slots.center}</div>
            </div>
          ) : (
            <AxeWordmarkLive />
          )}
        </div>

        {/* Right — AXE context (page-injected) or quick-action menu */}
        <div className="flex items-center">
          {slots.right ?? <QuickActionMenu />}
        </div>
      </div>

      {/* Desktop rail */}
      <aside
        className="tos-shell-desktop-rail fixed bottom-0 left-0 top-0 z-40 hidden w-[4.25rem] flex-col border-r border-white/[0.06] bg-[var(--tos-bg-base)]/80 py-3 backdrop-blur-xl"
        aria-label="Primary"
      >
        <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-1.5 pt-[max(0.5rem,env(safe-area-inset-top))]">
          {NAV.map((item) => (
            <NavLink key={item.href} item={item} compact />
          ))}
        </div>
      </aside>

      {/* Mobile drawer */}
      <div
        className={`fixed inset-0 z-[60] tos-shell-mobile-chrome ${open ? "pointer-events-auto" : "pointer-events-none"}`}
        aria-hidden={!open}
      >
        <button
          type="button"
          className={`absolute inset-0 bg-black/65 transition-opacity ${
            open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
          }`}
          onClick={close}
          aria-label="Close menu"
        />
        <div
          className={`absolute left-0 top-0 flex h-full w-[min(20rem,88vw)] max-w-full flex-col border-r border-white/[0.08] bg-[var(--tos-bg-base)] shadow-2xl transition-transform ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-white/80">Navigate</span>
            <button
              type="button"
              onClick={close}
              className="rounded-lg p-2 text-tos-muted hover:bg-white/[0.06]"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <nav className="tos-scrollbar flex flex-1 flex-col gap-0.5 overflow-y-auto p-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {NAV.map((item) => (
              <NavLink key={item.href} item={item} onNavigate={close} />
            ))}
          </nav>
        </div>
      </div>
    </>
  );
}
