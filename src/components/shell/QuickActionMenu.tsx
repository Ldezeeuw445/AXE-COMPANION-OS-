"use client";

/**
 * QuickActionMenu — AXE logo button that opens a fast-action popover.
 *
 * Replaces the static "Link to /chat" on the top-right of every page.
 * Tap the logo → see a compact grid of quick actions.
 * Tap outside or tap an action → closes.
 */

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bell,
  BookOpen,
  Brain,
  Briefcase,
  CreditCard,
  LineChart,
  MessageSquare,
  Settings,
  Sparkles,
  Vault,
} from "lucide-react";
import { AxeTriangle } from "@/components/brand/AxeTriangle";

function IntelIcon({ className }: { className?: string }) {
  return <AxeTriangle size={16} className={className} />;
}

const ACTIONS = [
  { href: "/chat", label: "Chat", Icon: MessageSquare },
  { href: "/chart", label: "Chart", Icon: LineChart },
  { href: "/intel", label: "Intel", Icon: IntelIcon as typeof MessageSquare },
  { href: "/alerts", label: "Alerts", Icon: Bell },
  { href: "/actions", label: "Actions", Icon: Briefcase },
  { href: "/journal", label: "Journal", Icon: BookOpen },
  { href: "/market", label: "Market", Icon: Sparkles },
  { href: "/vault", label: "Vault", Icon: Vault },
  { href: "/cockpit", label: "Cockpit", Icon: Brain },
  { href: "/upgrade", label: "Upgrade", Icon: CreditCard },
  { href: "/settings", label: "Settings", Icon: Settings },
] as const;

const CYAN = "#00d4f5";

export function QuickActionMenu() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const toggle = useCallback(() => setOpen((v) => !v), []);
  const close = useCallback(() => setOpen(false), []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent | TouchEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler, true);
    document.addEventListener("touchstart", handler, true);
    return () => {
      document.removeEventListener("mousedown", handler, true);
      document.removeEventListener("touchstart", handler, true);
    };
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <div ref={menuRef} className="relative inline-flex">
      {/* Logo button */}
      <button
        type="button"
        onClick={toggle}
        className="relative inline-flex h-11 w-11 items-center justify-center"
        aria-label="Quick actions"
        aria-expanded={open}
      >
        <Image
          src="/axe-logo-companion.png"
          alt=""
          width={32}
          height={32}
          className="pointer-events-none h-8 w-8 object-contain"
          priority
          unoptimized
        />
        {/* Subtle ring when open */}
        {open && (
          <span
            className="pointer-events-none absolute inset-[3px] rounded-full"
            style={{ border: `1.5px solid ${CYAN}33` }}
          />
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <>
          {/* Scrim */}
          <div className="fixed inset-0 z-[70] bg-black/40" aria-hidden />
          {/* Menu */}
          <div
            className="absolute right-0 top-full z-[71] mt-2 w-[200px] origin-top-right animate-in fade-in slide-in-from-top-1 rounded-2xl border border-white/[0.08] bg-[#0c0c10]/95 p-2 shadow-2xl backdrop-blur-xl duration-150"
            role="menu"
          >
            <div className="grid grid-cols-3 gap-1">
              {ACTIONS.map(({ href, label, Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={close}
                  role="menuitem"
                  className="flex flex-col items-center gap-1 rounded-xl px-1 py-2.5 transition-colors hover:bg-white/[0.06] active:bg-white/[0.10]"
                >
                  <Icon
                    className="h-[18px] w-[18px]"
                    style={{ color: "rgba(255,255,255,0.5)" }}
                    strokeWidth={1.5}
                    aria-hidden
                  />
                  <span className="text-[9px] font-medium tracking-wide text-white/40">
                    {label}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
