"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

function DemoEmbedInner() {
  const params = useSearchParams();
  const device = params.get("device") === "tablet" ? "tablet" : "phone";
  const theme = params.get("theme") === "paper" ? "paper" : "midnight";
  const rawTo = params.get("to") ?? "/chart?symbol=XAUUSD&tf=H1";
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const target = useMemo(() => {
    const path = rawTo.startsWith("/") ? rawTo : "/chart?symbol=XAUUSD&tf=H1";
    const url = new URL(path, "https://axe.local");
    url.searchParams.set("embed", "1");
    url.searchParams.set("demo", "1");
    url.searchParams.set("embedDevice", device);
    if (theme === "paper") url.searchParams.set("chartTheme", "paper");
    else url.searchParams.set("chartTheme", "midnight");
    return `${url.pathname}${url.search}`;
  }, [rawTo, theme, device]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/demo", { method: "POST", credentials: "include" });
        const body = (await res.json()) as { ok?: boolean; error?: string };
        if (cancelled) return;
        if (!res.ok || !body.ok) {
          setError(body.error ?? "Demo sign-in failed");
          return;
        }
        setReady(true);
      } catch {
        if (!cancelled) setError("Network error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main
      data-device={device}
      data-theme={theme}
      className="axe-demo-embed-root h-dvh w-full overflow-hidden bg-[#040508]"
    >
      {!ready && !error ? (
        <div className="grid h-full place-items-center px-4 text-center">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300/80">
              AXE Demo
            </p>
            <p className="mt-2 text-sm text-white/70">Loading full app preview…</p>
          </div>
        </div>
      ) : null}
      {error ? (
        <div className="grid h-full place-items-center px-4 text-center">
          <p className="text-sm text-rose-300/90">{error}</p>
        </div>
      ) : null}
      {ready ? (
        <iframe
          title={device === "tablet" ? "AXE iPad demo" : "AXE phone demo"}
          src={target}
          className="h-full w-full border-0 bg-[#040508]"
          allow="clipboard-write"
        />
      ) : null}
    </main>
  );
}

export default function DemoEmbedPage() {
  return (
    <Suspense
      fallback={
        <div className="grid h-dvh place-items-center bg-[#040508] text-sm text-white/60">
          Loading…
        </div>
      }
    >
      <DemoEmbedInner />
    </Suspense>
  );
}
