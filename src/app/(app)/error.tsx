"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Reported in production too. This block used to be wrapped in
    // `if (process.env.NODE_ENV !== "production")`, so the screen below
    // promised "This has been noted" while noting nothing for real users.
    console.error("[AXE Error]", error);
    void fetch("/api/diagnostics/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        source: "app_error_boundary",
        message: error.message,
        stack: error.stack ?? null,
        // Next replaces the message of a server-side error with a generic one
        // and gives it a digest; the digest is what ties this row to the host
        // log line that carries the real stack.
        digest: error.digest ?? null,
        url: typeof window !== "undefined" ? window.location.href : null,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      }),
    }).catch(() => {
      // A failed report must never replace the error the user is already seeing.
    });
  }, [error]);

  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center px-6 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/[0.08]">
        <AlertTriangle className="h-8 w-8 text-red-400" />
      </div>
      <h2 className="mb-2 text-lg font-semibold text-white">
        Something went wrong
      </h2>
      <p className="mb-6 max-w-sm text-sm text-tos-muted">
        AXE encountered an unexpected error. This has been noted.
        {error.digest && (
          <span className="mt-1 block font-mono text-[10px] text-tos-dim">
            ref: {error.digest}
          </span>
        )}
      </p>
      <button
        type="button"
        onClick={reset}
        className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/[0.08] active:bg-white/[0.10]"
      >
        <RefreshCw className="h-4 w-4" />
        Try again
      </button>
    </div>
  );
}
