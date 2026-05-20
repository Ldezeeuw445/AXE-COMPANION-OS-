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
  ScrollText,
  Settings,
  Sparkles,
  Target,
  Vault,
  X,
  Landmark,
} from "lucide-react";
import { useAppTopBarSlots } from "@/components/shell/AppTopBarContext";
import { AxeWordmarkLive } from "@/components/brand/AxeWordmarkLive";

type NavItem = {
  href: string;
  label: string;
  Icon: typeof MessageSquare;
  /** If true, still routing but labeled coming soon in drawer */
  comingSoon?: boolean;
};

const NAV: NavItem[] = [
  { href: "/chat", label: "Chat", Icon: MessageSquare },
  { href: "/accounts", label: "Accounts", Icon: Landmark },
  { href: "/positions", label: "Positions", Icon: Layers },
  { href: "/chart", label: "Chart", Icon: LineChart },
  { href: "/history", label: "History", Icon: ScrollText },
  { href: "/journal", label: "Journal", Icon: BookOpen },
  { href: "/watchlist", label: "Watchlist", Icon: BarChart3 },
  { href: "/intel", label: "Intel", Icon: Target },
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
      <div className="sticky top-0 z-40 grid min-h-[var(--tos-topbar-h)] shrink-0 grid-cols-[2.75rem_1fr_2.75rem] items-center border-b border-white/[0.04] bg-[var(--tos-bg-base)]/85 px-2 pt-[env(safe-area-inset-top)] backdrop-blur-xl md:hidden">
        <div className="flex justify-start">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white/80 active:bg-white/[0.08]"
            aria-label="Open menu"
          >
            <Menu className="h-[18px] w-[18px]" />
          </button>
        </div>

        <div className="pointer-events-none relative flex min-w-0 items-center justify-center">
          {isChart ? null : <AxeWordmarkLive />}

          {slots.center ? (
            <div
              className={`pointer-events-auto absolute left-1/2 z-[41] flex -translate-x-1/2 justify-center px-1 ${
                isChart ? "top-1/2 -translate-y-1/2" : "top-[calc(100%-0.15rem)]"
              }`}
            >
              <div className="max-w-[min(18rem,calc(100vw-7rem))]">{slots.center}</div>
            </div>
          ) : null}
        </div>

        <div className="flex justify-end">{slots.right}</div>
      </div>

      {/* Desktop rail */}
      <aside
        className="fixed bottom-0 left-0 top-0 z-40 hidden w-[4.25rem] flex-col border-r border-white/[0.06] bg-[var(--tos-bg-base)]/80 py-3 backdrop-blur-xl md:flex"
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
        className={`fixed inset-0 z-[60] md:hidden ${open ? "pointer-events-auto" : "pointer-events-none"}`}
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
