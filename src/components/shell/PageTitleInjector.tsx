"use client";

import { useEffect } from "react";
import { useAppTopBar } from "@/components/shell/AppTopBarContext";

/**
 * Injects a page title into the mobile top bar center slot.
 * Lightweight replacement for ScreenHeader on pages without AxeTopBarInjector.
 */
export function PageTitleInjector({
  title,
  premium = false,
}: {
  title: string;
  premium?: boolean;
}) {
  const { setCenter } = useAppTopBar();

  useEffect(() => {
    setCenter(
      <span className="flex items-center gap-2">
        <span
          className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${
            premium ? "text-cyan-300" : "text-white/70"
          }`}
        >
          {title}
        </span>
        {premium ? (
          <span className="rounded border border-cyan-400/20 bg-cyan-400/[0.08] px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-cyan-300/80">
            PRO
          </span>
        ) : null}
      </span>,
    );
    return () => setCenter(null);
  }, [premium, title, setCenter]);

  return null;
}
