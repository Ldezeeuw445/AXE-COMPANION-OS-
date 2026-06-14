"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart2,
  BarChart3,
  Clock,
  Crosshair,
  Landmark,
  LineChart,
  MessageSquare,
  Newspaper,
  Repeat2,
  Settings,
  Star,
  X,
  Zap,
} from "lucide-react";
import { useAmbient } from "@/components/ambient/AmbientProvider";

const CYAN = "#00d4f5";

const NAV_TABS = [
  { href: "/chat", label: "AXE", Icon: MessageSquare },
  { href: "/watchlist", label: "Quotes", Icon: BarChart3 },
  { href: "/chart", label: "Chart", Icon: LineChart },
  { href: "/positions", label: "Trade", Icon: Repeat2 },
  { href: "/history", label: "History", Icon: Clock },
  { href: "/settings", label: "Settings", Icon: Settings },
] as const;

type Props = {
  open: boolean;
  onClose: () => void;
  orderBookOpen: boolean;
  newsOpen: boolean;
  oneClickActive: boolean;
  pendingActive: boolean;
  onDepth: () => void;
  onNews: () => void;
  onOneClick: () => void;
  onPending: () => void;
  onTools: () => void;
};

export function ChartLandscapeDrawer({
  open,
  onClose,
  orderBookOpen,
  newsOpen,
  oneClickActive,
  pendingActive,
  onDepth,
  onNews,
  onOneClick,
  onPending,
  onTools,
}: Props) {
  const pathname = usePathname();
  const { playSound, vibrate } = useAmbient();
  const isAxeView = pathname === "/chat" || pathname.startsWith("/chat/");

  return (
    <>
      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-[10050] bg-black/55 backdrop-blur-[2px]"
          aria-label="Close chart menu"
          onClick={onClose}
        />
      ) : null}

      <div
        className={`fixed inset-x-0 bottom-0 z-[10060] max-h-[min(72dvh,28rem)] overflow-y-auto rounded-t-[1.35rem] border border-white/10 bg-[#060608]/97 shadow-[0_-20px_60px_rgba(0,0,0,0.65)] backdrop-blur-xl transition-transform duration-300 ease-out ${
          open ? "translate-y-0" : "translate-y-full pointer-events-none"
        }`}
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/70">Chart menu</p>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-white/60"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 py-3">
          <p className="mb-2 text-[9px] font-bold uppercase tracking-[0.18em] text-white/35">Navigate</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {NAV_TABS.map(({ href, label, Icon }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => {
                    vibrate("light");
                    playSound("tap");
                    onClose();
                  }}
                  className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-center transition-colors ${
                    active
                      ? "border-cyan-400/30 bg-cyan-400/[0.08] text-cyan-300"
                      : "border-white/[0.06] bg-white/[0.02] text-white/55 hover:bg-white/[0.05]"
                  }`}
                >
                  <Icon className="h-4 w-4" strokeWidth={active ? 2 : 1.5} />
                  <span className="text-[8px] font-semibold uppercase tracking-wider">{label}</span>
                </Link>
              );
            })}
            {isAxeView ? (
              <Link
                href="/upgrade"
                onClick={() => {
                  vibrate("light");
                  playSound("tap");
                  onClose();
                }}
                className="flex flex-col items-center gap-1 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-2 py-2.5 text-amber-200/80"
              >
                <Star className="h-4 w-4" />
                <span className="text-[8px] font-semibold uppercase tracking-wider">Upgrade</span>
              </Link>
            ) : null}
          </div>
        </div>

        <div className="border-t border-white/[0.06] px-4 py-3">
          <p className="mb-2 text-[9px] font-bold uppercase tracking-[0.18em] text-white/35">Chart & trade</p>
          <div className="grid grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => {
                onDepth();
                vibrate("light");
                playSound("tap");
              }}
              className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 ${
                orderBookOpen
                  ? "border-cyan-400/30 bg-cyan-400/[0.08] text-cyan-300"
                  : "border-white/[0.06] bg-white/[0.02] text-white/55"
              }`}
            >
              <BarChart2 className="h-4 w-4" />
              <span className="text-[8px] font-semibold uppercase tracking-wider">Depth</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onNews();
                vibrate("light");
                playSound("tap");
              }}
              className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 ${
                newsOpen
                  ? "border-cyan-400/30 bg-cyan-400/[0.08] text-cyan-300"
                  : "border-white/[0.06] bg-white/[0.02] text-white/55"
              }`}
            >
              <Newspaper className="h-4 w-4" />
              <span className="text-[8px] font-semibold uppercase tracking-wider">News</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onOneClick();
                vibrate("light");
                playSound("tap");
              }}
              className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 ${
                oneClickActive
                  ? "border-cyan-400/30 bg-cyan-400/[0.08] text-cyan-300"
                  : "border-white/[0.06] bg-white/[0.02] text-white/55"
              }`}
            >
              <Zap className="h-4 w-4" style={oneClickActive ? { color: CYAN } : undefined} />
              <span className="text-[8px] font-semibold uppercase tracking-wider">1-Click</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onPending();
                vibrate("light");
                playSound("tap");
              }}
              className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 ${
                pendingActive
                  ? "border-cyan-400/30 bg-cyan-400/[0.08] text-cyan-300"
                  : "border-white/[0.06] bg-white/[0.02] text-white/55"
              }`}
            >
              <Crosshair className="h-4 w-4" />
              <span className="text-[8px] font-semibold uppercase tracking-wider">Pending</span>
            </button>
          </div>
        </div>

        <div className="border-t border-white/[0.06] px-4 py-3">
          <div className="grid grid-cols-2 gap-2">
            <Link
              href="/accounts"
              onClick={() => {
                vibrate("light");
                playSound("tap");
                onClose();
              }}
              className="flex items-center justify-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.07] px-3 py-2.5 text-[11px] font-semibold text-emerald-100/90"
            >
              <Landmark className="h-4 w-4" />
              Accounts
            </Link>
            <button
              type="button"
              onClick={() => {
                onTools();
                vibrate("light");
                playSound("tap");
                onClose();
              }}
              className="flex items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[11px] font-semibold text-white/70"
            >
              <LineChart className="h-4 w-4" />
              Tools drawer
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export function ChartLandscapeDockHandle({
  onOpen,
  bottomOffset,
}: {
  onOpen: () => void;
  /** Extra lift when the execution bar is visible (e.g. "2.85rem"). */
  bottomOffset?: string;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="fixed z-[10040] grid h-11 w-11 place-items-center rounded-full border border-white/12 bg-black/78 text-white/75 shadow-[0_8px_28px_rgba(0,0,0,0.55)] backdrop-blur-md active:scale-95"
      style={{
        left: "max(0.65rem, env(safe-area-inset-left))",
        bottom: bottomOffset
          ? `calc(max(0.65rem, env(safe-area-inset-bottom)) + ${bottomOffset})`
          : "max(0.65rem, env(safe-area-inset-bottom))",
      }}
      aria-label="Open chart menu"
      title="Menu · navigate & trade"
    >
      <span className="flex flex-col gap-[3px]" aria-hidden>
        <span className="block h-[2px] w-4 rounded-full bg-cyan-300/90" />
        <span className="block h-[2px] w-4 rounded-full bg-cyan-300/70" />
        <span className="block h-[2px] w-4 rounded-full bg-cyan-300/50" />
      </span>
    </button>
  );
}
