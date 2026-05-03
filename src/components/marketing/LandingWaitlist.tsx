"use client";

import { useState, type FormEvent } from "react";

const STORAGE_KEY = "axe_waitlist";

export function LandingWaitlist() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    try {
      const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") as unknown;
      const list = Array.isArray(existing) ? existing : [];
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...list, email.trim()]));
    } catch {
      // ignore
    }
    setDone(true);
    setEmail("");
  };

  return (
    <div id="waitlist" className="scroll-mt-28">
      <p className="text-center text-sm text-white/55">
        Join for early AXE access and updates on Trading OS — our upcoming premium trading terminal. Same account and
        memory when both are live.
      </p>
      {done ? (
        <p className="mt-4 text-center text-sm font-medium text-emerald-400/95">You&apos;re on the list — thank you.</p>
      ) : (
        <form
          onSubmit={onSubmit}
          className="mx-auto mt-6 flex max-w-md flex-col gap-2 sm:flex-row sm:items-center sm:justify-center"
        >
          <input
            type="email"
            required
            placeholder="Your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11 flex-1 rounded-lg border border-white/12 bg-white/[0.05] px-3 text-sm text-white outline-none placeholder:text-white/35"
          />
          <button
            type="submit"
            className="h-11 shrink-0 rounded-lg border border-cyan-500/30 bg-cyan-500/15 px-5 text-sm font-medium text-cyan-100 hover:bg-cyan-500/25"
          >
            Join the Trading OS waitlist
          </button>
        </form>
      )}
    </div>
  );
}
