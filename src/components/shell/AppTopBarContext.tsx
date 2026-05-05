"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

type TopBarSlots = {
  center: ReactNode | null;
  right: ReactNode | null;
};

type TopBarContextValue = {
  slots: TopBarSlots;
  setCenter: (node: ReactNode | null) => void;
  setRight: (node: ReactNode | null) => void;
};

const AppTopBarContext = createContext<TopBarContextValue | null>(null);

/**
 * Lets pages inject content into the global mobile top bar
 * (between the hamburger and the right edge). Renders nothing by itself.
 */
export function AppTopBarProvider({ children }: { children: ReactNode }) {
  const [slots, setSlots] = useState<TopBarSlots>({ center: null, right: null });

  const setCenter = useCallback((node: ReactNode | null) => {
    setSlots((prev) => ({ ...prev, center: node }));
  }, []);

  const setRight = useCallback((node: ReactNode | null) => {
    setSlots((prev) => ({ ...prev, right: node }));
  }, []);

  const value = useMemo<TopBarContextValue>(() => ({ slots, setCenter, setRight }), [slots, setCenter, setRight]);

  return <AppTopBarContext.Provider value={value}>{children}</AppTopBarContext.Provider>;
}

export function useAppTopBarSlots(): TopBarSlots {
  const ctx = useContext(AppTopBarContext);
  return ctx ? ctx.slots : { center: null, right: null };
}

export function useAppTopBar(): { setCenter: (n: ReactNode | null) => void; setRight: (n: ReactNode | null) => void } {
  const ctx = useContext(AppTopBarContext);
  if (!ctx) {
    return {
      setCenter: () => undefined,
      setRight: () => undefined,
    };
  }
  return { setCenter: ctx.setCenter, setRight: ctx.setRight };
}
