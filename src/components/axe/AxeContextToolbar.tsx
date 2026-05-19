"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ChevronRight, X } from "lucide-react";
import { BrandMark } from "@/components/brand/BrandMark";

export type AxeToolbarItem = {
  id: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  /** Right-side small label (e.g. "soon", "off"). */
  hint?: string;
  /** External or in-app navigation. */
  href?: string;
  /** Click handler — used for client-side toggles, drawing tools, etc. */
  onSelect?: () => void;
  /** Mark item disabled with a friendly tooltip via `aria-disabled`. */
  disabled?: boolean;
};

export type AxeToolbarSection = {
  id: string;
  title?: string;
  items: AxeToolbarItem[];
};

type Props = {
  /** Title shown at the top of the sheet. */
  title: string;
  /** Optional subtitle (one short sentence). */
  subtitle?: string;
  sections: AxeToolbarSection[];
};

/**
 * Reusable AXE context button (top-right of a screen) that opens a premium
 * compact sheet with page-specific actions. Designed to feel like an
 * "AXE actions for this screen" surface — quiet by default, useful on tap.
 *
 * - Mobile: bottom sheet (full width, slides up).
 * - Desktop / md+: anchored panel (right-aligned popover).
 * - Closes on ESC, on backdrop tap, on item activation.
 */
export function AxeContextToolbar({ title, subtitle, sections }: Props) {
  const [open, setOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const triggerId = useId();

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        id={triggerId}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Open AXE actions for ${title}`}
        onClick={() => setOpen((v) => !v)}
        className="group relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/12 bg-gradient-to-br from-white/[0.07] via-white/[0.03] to-transparent backdrop-blur transition-all hover:border-white/20 hover:from-white/[0.10] focus:outline-none focus:ring-2 focus:ring-white/20"
        style={{
          boxShadow:
            "0 0 0 1px rgba(255,255,255,0.06), 0 8px 24px -10px rgba(0,0,0,0.40), inset 0 1px 0 rgba(255,255,255,0.10)",
        }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-2xl opacity-60 transition-opacity group-hover:opacity-90"
          style={{
            background:
              "radial-gradient(60% 60% at 50% 0%, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 70%)",
          }}
        />
        <BrandMark size={32} className="!bg-transparent !ring-0" />
        <span className="sr-only">AXE</span>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[80] flex items-start justify-end p-2 sm:p-3"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${triggerId}-title`}
        >
          <button
            type="button"
            aria-label="Close AXE actions"
            onClick={close}
            className="absolute inset-0 bg-[#08080a]/80 backdrop-blur-sm"
          />
          <div
            ref={sheetRef}
            className="relative z-[81] mt-[3.25rem] w-[min(20rem,calc(100vw-1rem))] origin-top-right rounded-2xl border border-white/[0.08] bg-[#0a0a0c]/95 p-3 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.50),0_0_0_1px_rgba(255,255,255,0.06)] backdrop-blur-xl sm:mt-[3.5rem]"
            style={{ animation: "axeSheetIn 160ms ease-out both" }}
          >
            <header className="mb-2 flex items-center justify-between gap-3 px-2 pt-1">
              <div className="min-w-0">
                <p
                  id={`${triggerId}-title`}
                  className="truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80"
                >
                  AXE · {title}
                </p>
                {subtitle ? (
                  <p className="mt-0.5 truncate text-[11px] text-tos-muted">{subtitle}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="rounded-full border border-white/10 bg-white/[0.04] p-1.5 text-tos-muted hover:bg-white/[0.08]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </header>

            <style>{`
              @keyframes axeSheetIn {
                from { opacity: 0; transform: translateY(-4px) scale(0.96); }
                to { opacity: 1; transform: translateY(0) scale(1); }
              }
            `}</style>
            <div className="tos-scrollbar max-h-[70vh] overflow-y-auto pr-1 sm:max-h-[68vh]">
              {sections.map((section) => (
                <section key={section.id} className="mb-2 last:mb-0">
                  {section.title ? (
                    <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-tos-dim">
                      {section.title}
                    </p>
                  ) : null}
                  <ul className="space-y-1">
                    {section.items.map((item) => (
                      <li key={item.id}>
                        <ToolbarRow item={item} onActivate={close} />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>

            <p className="mt-3 px-2 text-center text-[10px] text-tos-dim/85">
              AXE prepares context — execution stays disabled by default.
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}

function ToolbarRow({
  item,
  onActivate,
}: {
  item: AxeToolbarItem;
  onActivate: () => void;
}) {
  const baseClass =
    "group/item flex w-full items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-2.5 text-left transition-colors hover:border-white/[0.12] hover:bg-white/[0.05] focus:outline-none focus:ring-2 focus:ring-white/15";
  const labelEl = (
    <>
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-white/[0.07] bg-[#0e0f12]/95 text-white/60">
        {item.icon ?? <ChevronRight className="h-3.5 w-3.5" aria-hidden />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-medium text-tos-text">{item.label}</span>
        {item.description ? (
          <span className="block truncate text-[10.5px] leading-tight text-tos-muted">{item.description}</span>
        ) : null}
      </span>
      {item.hint ? (
        <span className="shrink-0 rounded-full border border-white/[0.07] px-2 py-0.5 text-[9px] uppercase tracking-wider text-tos-dim">
          {item.hint}
        </span>
      ) : null}
    </>
  );

  if (item.href && !item.disabled) {
    return (
      <Link href={item.href} onClick={onActivate} className={baseClass} prefetch={false}>
        {labelEl}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        if (item.disabled) return;
        item.onSelect?.();
        onActivate();
      }}
      aria-disabled={item.disabled || undefined}
      className={`${baseClass} ${item.disabled ? "opacity-55" : ""}`}
    >
      {labelEl}
    </button>
  );
}
