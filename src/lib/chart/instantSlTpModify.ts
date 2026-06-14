"use client";

import { useCallback, useEffect, useState } from "react";

const LS_KEY = "axe.instant_sl_tp_modify.v1";

function readLocal(): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (raw === "1") return true;
    if (raw === "0") return false;
    return null;
  } catch {
    return null;
  }
}

function writeLocal(value: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, value ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function useInstantSlTpModify(initialEnabled = false) {
  const [enabled, setEnabled] = useState(() => readLocal() ?? initialEnabled);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const local = readLocal();
    if (local == null) setEnabled(initialEnabled);
  }, [initialEnabled]);

  const setInstant = useCallback(async (next: boolean) => {
    setPending(true);
    setEnabled(next);
    writeLocal(next);
    try {
      await fetch("/api/preferences/instant-sl-tp-modify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ instant: next }),
      });
    } catch {
      /* local preference still applied */
    } finally {
      setPending(false);
    }
  }, []);

  return { enabled, pending, setInstant };
}
