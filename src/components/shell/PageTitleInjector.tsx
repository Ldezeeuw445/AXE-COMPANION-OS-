"use client";

import { useEffect } from "react";
import { useAppTopBar } from "@/components/shell/AppTopBarContext";

/**
 * Injects a page title into the mobile top bar center slot.
 * Replaces ScreenHeader for pages that don't use AxeTopBarInjector.
 */
export function PageTitleInjector({ title }: { title: string }) {
  const { setCenter } = useAppTopBar();

  useEffect(() => {
    setCenter(
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">
        {title}
      </span>,
    );
    return () => setCenter(null);
  }, [title, setCenter]);

  return null;
}
