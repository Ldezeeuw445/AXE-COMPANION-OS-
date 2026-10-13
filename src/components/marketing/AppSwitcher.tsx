"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, Monitor, Smartphone } from "lucide-react";

import {
  PUBLIC_ECOSYSTEM_APPS,
  availabilityLabel,
  isReachable,
  type EcosystemAppId,
} from "@/lib/ecosystem/apps";

type Props = {
  /** Which surface the visitor is on right now; marked with a check, never a link. */
  current: EcosystemAppId;
  className?: string;
};

const FORM_ICON = { phone: Smartphone, desktop: Monitor } as const;

/**
 * Top-left app switcher. This is the menu you reach for when you are on one
 * surface and want the other — the same move in Companion and in Trading OS,
 * so the two apps stop being islands.
 *
 * Deliberately hand-rolled rather than a headless menu: the landing header has
 * no component library behind it, and a 70-line disclosure keeps the public
 * page's JS payload honest.
 */
export function AppSwitcher({ current, className }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const activeName =
    PUBLIC_ECOSYSTEM_APPS.find((app) => app.id === current)?.name ?? "AXE";

  return (
    <div ref={rootRef} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${activeName} — switch app`}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-full border border-white/12 bg-white/[0.04] px-2 py-1.5 text-xs font-medium text-white/70 transition hover:border-cyan-300/30 hover:bg-cyan-300/[0.07] hover:text-cyan-100 sm:pl-2.5"
      >
        {/* aria-label on the button covers every width; this is the visible
            affordance, hidden on phones where the header is tight. */}
        <span className="hidden whitespace-nowrap sm:inline">Switch app</span>
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="AXE ecosystem"
          /* On a phone the trigger sits mid-header, so a left-anchored 19rem
             panel runs off the right edge — and the page clips horizontal
             overflow, which makes the lost half unreachable rather than just
             ugly. Below sm the panel spans the viewport with a gutter; from sm
             up it hangs off the trigger as a normal menu. */
          className="fixed left-3 right-3 top-[3.75rem] z-50 w-auto overflow-hidden rounded-2xl border border-white/[0.09] bg-[#05080b] p-1.5 shadow-[0_28px_70px_-20px_rgba(0,0,0,0.9)] sm:absolute sm:left-0 sm:right-auto sm:top-[calc(100%+0.5rem)] sm:w-[19rem]"
        >
          <p className="px-3 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">
            One account, two surfaces
          </p>

          {PUBLIC_ECOSYSTEM_APPS.map((app) => {
            const Icon = FORM_ICON[app.form];
            const isCurrent = app.id === current;
            // The surface you are looking at is self-evidently up, so its own
            // availability badge would only ever confuse.
            const badge = isCurrent ? null : availabilityLabel(app.availability);

            const inner = (
              <>
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-cyan-400/20 bg-cyan-400/[0.06]">
                  <Icon className="h-4 w-4 text-cyan-200" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-semibold text-white">
                      {app.name}
                    </span>
                    {badge ? (
                      <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.05] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white/55">
                        {badge}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-[11.5px] leading-snug text-white/50">
                    {app.tagline}
                  </span>
                </span>
                {isCurrent ? (
                  <Check className="mt-1 h-4 w-4 shrink-0 text-cyan-300" aria-hidden />
                ) : null}
              </>
            );

            if (isCurrent) {
              return (
                <span
                  key={app.id}
                  role="menuitem"
                  aria-current="true"
                  className="flex gap-2.5 rounded-xl bg-cyan-300/[0.05] px-2.5 py-2.5"
                >
                  {inner}
                </span>
              );
            }

            // Listing a surface is useful; handing someone a dead page is not.
            if (!isReachable(app.availability)) {
              return (
                <span
                  key={app.id}
                  role="menuitem"
                  aria-disabled="true"
                  className="flex gap-2.5 rounded-xl px-2.5 py-2.5 opacity-55"
                >
                  {inner}
                </span>
              );
            }

            return (
              <Link
                key={app.id}
                href={app.url}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex gap-2.5 rounded-xl px-2.5 py-2.5 transition hover:bg-white/[0.05]"
              >
                {inner}
              </Link>
            );
          })}

          <p className="border-t border-white/[0.06] px-3 py-2.5 text-[11px] leading-snug text-white/40">
            Same login, same broker accounts, same AXE memory on both.
          </p>
        </div>
      ) : null}
    </div>
  );
}
