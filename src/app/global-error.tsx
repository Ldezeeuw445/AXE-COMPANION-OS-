"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Same fix as (app)/error.tsx: this only logged outside production, so a
    // root-layout crash left no trace anywhere a person could reach.
    console.error("[AXE Global Error]", error);
    void fetch("/api/diagnostics/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        source: "global_error_boundary",
        message: error.message,
        stack: error.stack ?? null,
        digest: error.digest ?? null,
        url: typeof window !== "undefined" ? window.location.href : null,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      }),
    }).catch(() => {
      /* never let a failed report mask the crash */
    });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          background: "#060608",
          color: "#fff",
          fontFamily: "system-ui, -apple-system, sans-serif",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100dvh",
          textAlign: "center",
          padding: "1.5rem",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 48,
              marginBottom: 16,
              opacity: 0.5,
            }}
          >
            ⚠
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
            AXE encountered a critical error
          </h2>
          <p
            style={{
              fontSize: 14,
              color: "rgba(255,255,255,0.5)",
              maxWidth: 320,
              margin: "0 auto 24px",
            }}
          >
            The app failed to load. Please try refreshing.
            {error.digest && (
              <span
                style={{
                  display: "block",
                  marginTop: 8,
                  fontFamily: "monospace",
                  fontSize: 10,
                  color: "rgba(255,255,255,0.3)",
                }}
              >
                ref: {error.digest}
              </span>
            )}
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 12,
              color: "#fff",
              padding: "10px 20px",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Refresh
          </button>
        </div>
      </body>
    </html>
  );
}
