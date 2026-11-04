"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { consumeHandoff, stripHandoffFromHistory } from "@/lib/auth/handoffClient";

/**
 * Completes a Trading OS → Companion session handoff. Reads the one-time code
 * from the URL fragment, strips it from history, exchanges it once via the
 * auth-handoff edge function, then verifyOtp. The code never stays in the URL.
 */
export default function AuthHandoffPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const { hash, search, origin } = window.location;
    stripHandoffFromHistory();
    void consumeHandoff({ hash, search, origin }).then((r) => {
      if (r.ok) {
        router.replace(r.nextPath === "/" ? "/chat" : r.nextPath);
        router.refresh();
      } else {
        setError(r.error);
      }
    });
  }, [router]);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center bg-[#0a0a0a] px-6 text-center">
      {error ? (
        <div className="max-w-md space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-amber-200/90">Handoff failed</p>
          <p className="text-sm text-white/70">Could not complete the shared login from Trading OS.</p>
          <p className="text-[11px] text-white/40">{error}</p>
          <Link href="/login" className="inline-block text-[11px] text-cyan-300 hover:underline">
            Sign in
          </Link>
        </div>
      ) : (
        <p className="text-[11px] text-white/45">Opening your shared AXE session…</p>
      )}
    </div>
  );
}
