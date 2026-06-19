"use client";

import { useState, type FormEvent } from "react";
import { ArrowUpRight, Monitor, Smartphone, Sparkles } from "lucide-react";

const STORAGE_KEY = "trading_os_waitlist";

export function WaitlistForm() {
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
      {done ? (
        <p className="text-center text-sm font-medium text-emerald-400/95">
          You&apos;re on the list — we&apos;ll reach out when the terminal opens.
        </p>
      ) : (
        <form
          onSubmit={onSubmit}
          className="mx-auto flex max-w-md flex-col gap-2 sm:flex-row sm:items-center sm:justify-center"
        >
          <input
            type="email"
            required
            placeholder="Your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11 flex-1 rounded-lg border border-white/12 bg-white/[0.05] px-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-cyan-500/40"
          />
          <button
            type="submit"
            className="h-11 shrink-0 rounded-lg border border-cyan-500/30 bg-cyan-500/15 px-5 text-sm font-medium text-cyan-100 transition hover:bg-cyan-500/25"
          >
            Join private beta
          </button>
        </form>
      )}
    </div>
  );
}

export function FeatureCards() {
  const items = [
    {
      title: "Built for the desk",
      body: "Multi-monitor layout, keyboard-first flows, and a calm dark canvas that stays out of your way when price is moving.",
      icon: Monitor,
    },
    {
      title: "Same brain as AXE Companion",
      body: "One Supabase login, one memory spine. Journal, alerts, and AXE context carry between phone and desktop.",
      icon: Sparkles,
    },
    {
      title: "Phone + terminal, one OS",
      body: "Chart on the phone, size on the desk — or the other way around. Trading OS and AXE Companion share the same execution model.",
      icon: Smartphone,
    },
  ] as const;

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {items.map(({ title, body, icon: Icon }) => (
        <article
          key={title}
          className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm"
        >
          <div className="mb-3 inline-flex rounded-lg border border-cyan-500/20 bg-cyan-500/10 p-2 text-cyan-300">
            <Icon className="h-4 w-4" aria-hidden />
          </div>
          <h3 className="font-[family-name:var(--font-display)] text-base font-semibold text-white">{title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-white/60">{body}</p>
        </article>
      ))}
    </div>
  );
}

export function CompanionLink() {
  return (
    <a
      href="https://axecompanion.com"
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-sm text-cyan-300/90 transition hover:text-cyan-200"
    >
      AXE Companion is live today
      <ArrowUpRight className="h-4 w-4" aria-hidden />
    </a>
  );
}
