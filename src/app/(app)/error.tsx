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
    // Optionally log to an error reporting service
    if (process.env.NODE_ENV !== "production") {
      console.error("[AXE Error]", error);
    }
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
