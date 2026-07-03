"use client";

import { useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";

type Props = {
  className?: string;
};

export function ManageBillingButton({ className }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openPortal() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const body = (await res.json()) as { ok?: boolean; url?: string; code?: string };
      if (!res.ok || !body.url) {
        setError(
          body.code === "no_stripe_customer"
            ? "No Stripe subscription on file yet."
            : "Could not open billing portal.",
        );
        return;
      }
      window.location.href = body.url;
    } catch {
      setError("Network error — try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => void openPortal()}
        disabled={loading}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.05] py-2.5 text-xs font-semibold text-white/90 transition-colors hover:bg-white/[0.08] disabled:opacity-60"
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : (
          <CreditCard className="h-3.5 w-3.5" aria-hidden />
        )}
        Manage billing
      </button>
      {error ? <p className="mt-2 text-center text-[10px] text-rose-300/90">{error}</p> : null}
    </div>
  );
}
