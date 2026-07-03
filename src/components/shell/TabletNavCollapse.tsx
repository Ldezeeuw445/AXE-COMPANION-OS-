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
import { isTabletViewport } from "@/lib/viewport/tablet";

type TabletNavCollapseContextValue = {
  enabled: boolean;
  collapsed: boolean;
  collapse: () => void;
  expand: () => void;
  toggle: () => void;
};

const TabletNavCollapseContext = createContext<TabletNavCollapseContextValue | null>(null);

const STORAGE_KEY = "axe.tablet.navCollapsed";

export function TabletNavCollapseProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    function syncEnabled() {
      setEnabled(isTabletViewport());
    }
    syncEnabled();
    window.addEventListener("resize", syncEnabled);
    window.addEventListener("orientationchange", syncEnabled);
    return () => {
      window.removeEventListener("resize", syncEnabled);
      window.removeEventListener("orientationchange", syncEnabled);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw === "1") setCollapsed(true);
    } catch {
      /* ignore */
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      document.body.classList.remove("tos-tablet-nav-collapsed");
      return;
    }
    document.body.classList.toggle("tos-tablet-nav-collapsed", collapsed);
    try {
      sessionStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
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
      enabled: false,
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
