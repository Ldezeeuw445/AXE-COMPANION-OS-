"use client";

import { useEffect, useState } from "react";

/** True when the browser reports a network. Defaults to online for SSR. */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine !== false);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    sync();
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  return online;
}
