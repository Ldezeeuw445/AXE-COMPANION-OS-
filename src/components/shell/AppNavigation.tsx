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
  Vault,
  X,
  Landmark,
} from "lucide-react";
import { useAppTopBarSlots } from "@/components/shell/AppTopBarContext";
import { AxeWordmark } from "@/components/brand/AxeWordmark";

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
          ? "bg-cyan-500/15 text-cyan-200 ring-1 ring-cyan-500/25"
          : "text-tos-muted hover:bg-white/[0.05] hover:text-tos-text"
      } ${compact ? "justify-center px-0 py-3" : ""}`}
      title={item.label}
    >
      <item.Icon className={`h-5 w-5 shrink-0 ${active ? "text-cyan-300" : "text-tos-dim"}`} strokeWidth={active ? 2.1 : 1.7} />
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

  const close = useCallback(() => setOpen(false), []);
  useEffect(() => {
    // Close mobile drawer after client-side navigation (no Link click).
    queueMicrotask(() => setOpen(false));
  }, [pathname]);

  return (
    <>
      {/* Mobile top bar — hamburger | page center slot | page right slot */}
      <div className="sticky top-0 z-40 grid h-[3.25rem] shrink-0 grid-cols-[auto_1fr_auto] items-center gap-2 border-b border-white/[0.06] bg-tos-bg/90 px-2 backdrop-blur-md md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-400/20 bg-white/[0.04] text-cyan-300 transition-colors hover:bg-white/[0.08]"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex min-w-0 justify-center">
          {slots.center ?? (
            <AxeWordmark />
          )}
        </div>
        <div className="flex justify-end">{slots.right}</div>
      </div>

      {/* Desktop rail */}
      <aside
        className="fixed bottom-0 left-0 top-0 z-40 hidden w-[4.25rem] flex-col border-r border-white/[0.06] bg-black/50 py-3 backdrop-blur-xl md:flex"
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
          className={`absolute inset-0 bg-black/60 transition-opacity ${open ? "opacity-100" : "opacity-0"}`}
          onClick={close}
          aria-label="Close menu"
        />
        <div
          className={`absolute left-0 top-0 flex h-full w-[min(20rem,88vw)] max-w-full flex-col border-r border-white/10 bg-tos-bg shadow-2xl transition-transform ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Navigate</span>
            <button
              type="button"
              onClick={close}
              className="rounded-lg p-2 text-tos-muted hover:bg-white/10"
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
