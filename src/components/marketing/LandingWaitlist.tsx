"use client";

import { useState, type FormEvent } from "react";

/**
 * The only form on the landing page.
 *
 * It used to push the address into `localStorage` and print "You're on the
 * list — thank you." Nothing ever left the browser: no table, no endpoint, no
 * email. Every address typed into it since the page went up is gone, while
 * the privacy policy promised "waitlist communication" we had no way to send.
 *
 * It now posts to /api/waitlist, which stores the row on the service role,
 * and it only says thank you when the server said yes.
 */
export function LandingWaitlist() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const value = email.trim();
    if (!value || state === "sending") return;

    setState("sending");
    setError(null);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value, surface: "companion", source: "landing" }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setError(body.error ?? "Could not save that just now. Please try again.");
        setState("error");
        return;
      }
      setState("done");
      setEmail("");
    } catch {
      // A network failure is still a failure. Saying thank you here is how the
      // old version lost every address it was given.
      setError("No connection. Please try again.");
      setState("error");
    }
  };

  return (
    <div id="waitlist" className="scroll-mt-28">
      <p className="text-center text-sm text-white/55">
        Join for early AXE access and updates on Trading OS, the desktop terminal in private beta.
        Same account and memory on both.
      </p>
      {state === "done" ? (
        <p className="mt-4 text-center text-sm font-medium text-emerald-400/95" role="status">
          You&apos;re on the list — thank you.
        </p>
      ) : (
        <form
          onSubmit={onSubmit}
          className="mx-auto mt-6 flex max-w-md flex-col gap-2 sm:flex-row sm:items-center sm:justify-center"
        >
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="Your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={state === "sending"}
            aria-invalid={state === "error"}
            aria-describedby={error ? "waitlist-error" : undefined}
            className="h-11 flex-1 rounded-lg border border-white/12 bg-white/[0.05] px-3 text-sm text-white outline-none placeholder:text-white/35 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={state === "sending"}
            className="h-11 shrink-0 rounded-lg border border-cyan-500/30 bg-cyan-500/15 px-5 text-sm font-medium text-cyan-100 hover:bg-cyan-500/25 disabled:opacity-60"
          >
            {state === "sending" ? "Joining…" : "Join the Trading OS waitlist"}
          </button>
        </form>
      )}
      {error ? (
        <p id="waitlist-error" role="alert" className="mt-3 text-center text-xs text-rose-300/95">
          {error}
        </p>
      ) : null}
    </div>
  );
}
