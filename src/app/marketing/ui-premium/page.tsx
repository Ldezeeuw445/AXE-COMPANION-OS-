import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Mic, Paperclip, Send } from "lucide-react";

export const metadata: Metadata = {
  title: "Premium UI — Marketing · TradingOS Companion",
  robots: { index: false, follow: false },
};

const TICKER = [
  { pair: "EUR/USD", v: "+0.12%" },
  { pair: "GBP/USD", v: "-0.04%" },
  { pair: "XAU/USD", v: "+0.28%" },
  { pair: "NQ1!", v: "+0.41%" },
  { pair: "DXY", v: "-0.09%" },
  { pair: "BTC/USD", v: "+0.66%" },
];

const ASSETS = [
  { label: "Forex", glow: "rgba(46, 196, 182, 0.18)" },
  { label: "Metals", glow: "rgba(212, 184, 74, 0.16)" },
  { label: "Energy", glow: "rgba(245, 158, 11, 0.14)" },
  { label: "Commodities", glow: "rgba(167, 139, 250, 0.12)" },
  { label: "Equities", glow: "rgba(79, 143, 234, 0.14)" },
  { label: "Rates", glow: "rgba(148, 163, 184, 0.1)" },
  { label: "Crypto", glow: "rgba(167, 139, 250, 0.18)" },
] as const;

const NAV = [
  "Chart",
  "Intel",
  "Analyses",
  "Heatmap",
  "Macro",
  "AI Data Map",
] as const;

export default function MarketingUIPremiumPage() {
  return (
    <div className="min-h-dvh bg-tos-bg text-tos-text">
      <div className="flex h-dvh min-h-[640px] flex-col overflow-hidden">
        <div className="flex shrink-0 items-center gap-6 border-b border-[color:var(--tos-glass-border)] bg-tos-elevated/92 px-5 py-2 backdrop-blur-md">
          <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.2em] text-tos-dim">
            Live
          </span>
          <div className="flex min-w-0 flex-1 items-center gap-8 overflow-x-auto">
            {TICKER.map((t) => (
              <span
                key={t.pair}
                className="flex shrink-0 items-baseline gap-2 text-[11px] tabular-nums"
              >
                <span className="font-medium text-tos-muted">{t.pair}</span>
                <span
                  className={
                    t.v.startsWith("-") ? "text-tos-short" : "text-tos-long"
                  }
                >
                  {t.v}
                </span>
              </span>
            ))}
          </div>
          <span className="hidden shrink-0 text-[10px] text-tos-dim sm:inline">
            Trading OS
          </span>
        </div>

        <div className="flex min-h-0 flex-1">
          <aside className="hidden w-[13.5rem] shrink-0 flex-col border-r border-[color:var(--tos-glass-border)] bg-tos-bg/95 py-5 pl-4 pr-3 lg:flex">
            <p className="px-2 text-[10px] font-medium uppercase tracking-widest text-tos-dim">
              Navigate
            </p>
            <nav className="mt-4 flex flex-col gap-0.5">
              {NAV.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`rounded-lg px-2 py-2 text-left text-[12px] font-medium transition-colors ${
                    item === "Chart"
                      ? "bg-white/[0.04] text-tos-text shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                      : "text-tos-muted hover:bg-white/[0.03] hover:text-tos-text"
                  }`}
                >
                  {item}
                </button>
              ))}
            </nav>
            <div className="mt-8 border-t border-[color:var(--tos-glass-border)] pt-5">
              <p className="px-2 text-[10px] font-medium uppercase tracking-widest text-tos-dim">
                Watchlist
              </p>
              <ul className="mt-3 space-y-2 text-[11px]">
                {[
                  ["FX", "text-tos-long"],
                  ["Metals", "text-tos-gold"],
                  ["Crypto", "text-[#a78bfa]"],
                ].map(([label, color]) => (
                  <li
                    key={label}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white/[0.03]"
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${color}`} />
                    <span className="text-tos-muted">{label}</span>
                  </li>
                ))}
              </ul>
            </div>
          </aside>

          <main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">
            <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.28em] text-tos-warm">
                  Overview
                </p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
                  Command desk
                </h1>
                <p className="mt-1 max-w-xl text-sm text-tos-muted">
                  Zelfde kleur‑ en dieptetaal als Trading OS: koele strata,
                  ingetogen teal, goud voor risk‑off / metals — AXE zit in het
                  zelfde glas als je accounts.
                </p>
              </div>
              <div className="tos-card-premium px-5 py-4 sm:min-w-[220px]">
                <p className="text-[10px] font-medium uppercase tracking-wider text-tos-dim">
                  Total net worth
                </p>
                <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-tos-text">
                  €111,280
                </p>
                <p className="mt-0.5 text-xs font-medium text-tos-long">
                  +0.42% today
                </p>
              </div>
            </header>

            <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {ASSETS.map((a) => (
                <div
                  key={a.label}
                  className="tos-asset-pill px-3 py-3 transition-[box-shadow,transform] hover:-translate-y-px"
                  style={{
                    boxShadow: `var(--tos-inner-top), 0 8px 24px -12px rgba(0,0,0,0.55), 0 0 36px -20px ${a.glow}`,
                  }}
                >
                  <p className="text-[11px] font-medium text-tos-text">
                    {a.label}
                  </p>
                  <p className="mt-1 text-[9px] text-tos-dim">book</p>
                </div>
              ))}
            </div>

            <div className="mt-8 grid gap-6 lg:grid-cols-12">
              <div className="space-y-4 lg:col-span-7">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="tos-card-premium p-4">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-tos-dim">
                      Accounts
                    </p>
                    <p className="mt-2 text-sm font-semibold text-tos-text">
                      Funded Elite 100K
                    </p>
                    <p className="mt-1 text-xs text-tos-muted">
                      Phase 2 · risk cap 1.2R
                    </p>
                  </div>
                  <div className="tos-card-premium p-4">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-tos-dim">
                      Open risk
                    </p>
                    <p className="mt-2 font-mono text-xl font-bold tabular-nums text-tos-text">
                      0.38R
                    </p>
                    <p className="mt-1 text-xs text-tos-muted">
                      vs 1.0R daily stop
                    </p>
                  </div>
                </div>
                <div className="tos-card-premium-subtle p-4">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-tos-dim">
                    Positions
                  </p>
                  <p className="mt-3 text-sm text-tos-muted">
                    Flat · laatste journal sync 09:41
                  </p>
                </div>
              </div>

              <div className="lg:col-span-5">
                <GlassPanel
                  glow="warm"
                  className="flex h-full min-h-[420px] flex-col p-4 sm:p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <Image
                        src="/trading-os-logo.png"
                        alt=""
                        width={32}
                        height={32}
                        className="mt-0.5 h-8 w-8 shrink-0 object-contain"
                      />
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-tos-warm">
                          Trading OS
                        </p>
                        <h2 className="text-base font-bold tracking-tight text-tos-text">
                          Private channel
                        </h2>
                      </div>
                    </div>
                    <span className="rounded-md border border-[color:var(--tos-glass-border)] bg-white/[0.03] px-2 py-1 text-[9px] font-medium uppercase tracking-wider text-tos-muted">
                      Secure
                    </span>
                  </div>

                  <div className="tos-inset-panel mt-4 px-3 py-2.5">
                    <p className="text-[9px] font-medium uppercase tracking-wider text-tos-warm">
                      Pinned context
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-tos-muted">
                      NQ 19 832–19 880 bracket · invalidation onder prior VA low
                      op 5m close.
                    </p>
                  </div>

                  <div className="tos-scrollbar mt-4 flex flex-1 flex-col gap-4 overflow-y-auto pr-1">
                    <div className="tos-bubble-assistant max-w-[95%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed">
                      <p>
                        Alignement met je vandaag‑plan: geen nieuwe short tot
                        sweep boven 19 864 bevestigd is. Wil je size‑hint +0.5R
                        binnen bracket?
                      </p>
                    </div>
                    <div className="tos-bubble-user ml-auto max-w-[90%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed">
                      Ja — alleen als retest‑volume onder 90% van de impulse
                      blijft.
                    </div>
                  </div>

                  <div className="mt-4 shrink-0 border-t border-[color:var(--tos-glass-border)] pt-3">
                    <div className="tos-neu-composer flex items-end gap-2 rounded-[1.1rem] p-2">
                      <button
                        type="button"
                        className="tos-icon-recessed flex h-9 w-9 shrink-0 items-center justify-center text-tos-dim"
                        aria-label="Attach"
                      >
                        <Paperclip className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className="tos-icon-recessed flex h-9 w-9 shrink-0 items-center justify-center text-tos-dim"
                        aria-label="Voice"
                      >
                        <Mic className="h-4 w-4" />
                      </button>
                      <div className="flex flex-1 items-center py-2 text-[13px] text-tos-dim">
                        Ask AXE…
                      </div>
                      <button
                        type="button"
                        className="tos-btn-cyan flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                        aria-label="Send"
                      >
                        <Send className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </GlassPanel>
              </div>
            </div>

            <p className="mt-10 text-center text-[10px] text-tos-dim">
              Marketing preview —{" "}
              <Link
                href="/marketing/screenshots"
                className="text-tos-warm underline decoration-tos-warm/35 underline-offset-2 hover:decoration-tos-warm"
              >
                Phone frames
              </Link>
              {" · "}
              <Link
                href="/marketing/poster"
                className="text-tos-warm underline decoration-tos-warm/35 underline-offset-2 hover:decoration-tos-warm"
              >
                Poster
              </Link>
              {" · "}
              <code className="rounded bg-white/[0.04] px-1 py-0.5">
                /marketing/ui-premium
              </code>
            </p>
          </main>
        </div>
      </div>
    </div>
  );
}
