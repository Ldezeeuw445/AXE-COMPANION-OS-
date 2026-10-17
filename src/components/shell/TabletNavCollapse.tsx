"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useShellViewport } from "@/lib/viewport/shellViewport";

type TabletNavCollapseContextValue = {
  enabled: boolean;
  collapsed: boolean;
  collapse: () => void;
  expand: () => void;
  toggle: () => void;
};

const TabletNavCollapseContext = createContext<TabletNavCollapseContextValue | null>(null);

const STORAGE_KEY = "axe.navCollapsed";
const COLLAPSE_COOKIE = "axe.nav-collapsed";

function persistCollapsed(collapsed: boolean) {
  try {
    sessionStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
  } catch {
    /* ignore */
  }
  try {
    document.cookie = `${COLLAPSE_COOKIE}=${collapsed ? "1" : "0"}; Path=/; Max-Age=1800; SameSite=Lax`;
  } catch {
    /* ignore */
  }
}

function readCollapsedHint(): boolean {
  if (typeof document === "undefined") return false;
  if (/(?:^|; )axe\.nav-collapsed=1(?:;|$)/.test(document.cookie)) return true;
  try {
    return sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function TabletNavCollapseProvider({ children }: { children: ReactNode }) {
  const viewport = useShellViewport();
  // Phone-first: enabled on phone/tablet from the first render. Desktop
  // (mouse) has no bottom nav, so collapsing is off — matching CSS.
  const enabled = viewport !== "desktop";
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setCollapsed(false);
      return;
    }
    setCollapsed(readCollapsedHint());
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      document.body.classList.remove("tos-tablet-nav-collapsed");
      return;
    }
    document.body.classList.toggle("tos-tablet-nav-collapsed", collapsed);
    persistCollapsed(collapsed);
  }, [collapsed, enabled]);

  const collapse = useCallback(() => setCollapsed(true), []);
  const expand = useCallback(() => setCollapsed(false), []);
  const toggle = useCallback(() => setCollapsed((v) => !v), []);

  const value = useMemo(
    () => ({ enabled, collapsed, collapse, expand, toggle }),
    [enabled, collapsed, collapse, expand, toggle],
  );

  return (
    <TabletNavCollapseContext.Provider value={value}>{children}</TabletNavCollapseContext.Provider>
  );
}

export function useTabletNavCollapse(): TabletNavCollapseContextValue {
  const ctx = useContext(TabletNavCollapseContext);
  if (!ctx) {
    return {
      enabled: true,
      collapsed: false,
      collapse: () => {},
      expand: () => {},
      toggle: () => {},
    };
  }
  return ctx;
}

/** Swipe-down on navbar or swipe-up on peek handle (tablet only). */
export function useTabletNavSwipe(
  mode: "collapse" | "expand",
  onTrigger: () => void,
): {
  onPointerDown: (e: ReactPointerEvent) => void;
  onPointerUp: (e: ReactPointerEvent) => void;
  onPointerCancel: () => void;
} {
  const startYRef = useRef<number | null>(null);

  return {
    onPointerDown: (e) => {
      startYRef.current = e.clientY;
    },
    onPointerUp: (e) => {
      const startY = startYRef.current;
      startYRef.current = null;
      if (startY == null) return;
      const delta = e.clientY - startY;
      if (mode === "collapse" && delta > 36) onTrigger();
      if (mode === "expand" && delta < -28) onTrigger();
    },
    onPointerCancel: () => {
      startYRef.current = null;
    },
  };
}
