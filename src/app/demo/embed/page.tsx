"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

function DemoEmbedInner() {
  const params = useSearchParams();
  const device = params.get("device") === "tablet" ? "tablet" : "phone";
  const theme = params.get("theme") === "paper" ? "paper" : "midnight";
  const rawTo = params.get("to") ?? "/chart?symbol=XAUUSD&tf=H1";
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);

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
        // This used to mint an anonymous session so the mock could show the
        // real app to a stranger. Anonymous accounts are gone (see
        // /api/auth/demo), so the embed now only renders for someone who is
        // already signed in — and says so plainly when they are not, rather
        // than showing an unexplained black rectangle.
        const res = await fetch("/api/shell/status", { credentials: "include" });
        if (cancelled) return;
        setReady(res.ok);
        setError(!res.ok);
      } catch {
        if (!cancelled) setError(true);
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
      {ready && !error ? (
        <iframe
          title={device === "tablet" ? "AXE iPad demo" : "AXE phone demo"}
          src={target}
          className="h-full w-full border-0 bg-[#040508]"
          allow="clipboard-write"
        />
      ) : error ? (
        <div className="grid h-full place-items-center px-6 text-center">
          <div>
            <p className="text-[13px] font-medium text-white/85">Sign in to see the live app</p>
            <p className="mt-2 text-[12px] leading-relaxed text-white/55">
              The preview runs the real AXE interface on your own account, so it needs you
              signed in.
            </p>
            <a
              href="/login"
              className="mt-4 inline-flex rounded-lg border border-white/15 px-3 py-1.5 text-[12px] text-cyan-300/90"
            >
              Sign in
            </a>
          </div>
        </div>
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
