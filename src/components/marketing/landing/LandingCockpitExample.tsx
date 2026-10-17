import type { ReactNode } from "react";

/**
 * Decorative Cockpit illustration. Numbers are sample copy, not a live account.
 * The banner must stay visible so this never reads as someone's real book.
 */
export function LandingCockpitExample() {
  return (
    <section className="relative z-10 border-t border-white/[0.04] px-5 py-14 md:py-20">
      <div className="mx-auto max-w-6xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-200/80">
          AXE Companion Cockpit
        </p>
        <h2 className="mt-3 text-3xl font-bold tracking-[-0.03em] text-white md:text-4xl">
          Your AI. Your Edge. Your System.
        </h2>
        <p className="mt-3 max-w-2xl text-sm text-tos-muted">
          Real-time intelligence. Personalized. Always learning — inside the app, on Pro and above.
        </p>

        <div className="axe-landing-card-glow relative mt-8 overflow-hidden p-4 sm:p-6">
          <p
            className="mb-4 inline-flex rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-100"
            data-landing-cockpit-example="true"
          >
            Example — sample cockpit, not live data
          </p>

          <div className="grid gap-3 lg:grid-cols-3">
            <div className="space-y-3">
              <ExampleCard title="AXE Intelligence">
                <p className="text-[12px] text-white/70">
                  Context-aware briefings and intel snapshots for the active pair.
                </p>
                <p className="mt-3 text-[11px] text-white/45">Messages · sample · 12</p>
              </ExampleCard>
              <ExampleCard title="Instruments">
                <Row symbol="XAUUSD" note="London breakout bias" change="+1.2%" up />
                <Row symbol="SPXUSD" note="Risk-off into CPI" change="−0.4%" up={false} />
                <Row symbol="BTCUSD" note="Momentum continuation" change="+2.8%" up />
              </ExampleCard>
              <ExampleCard title="Behavior Map">
                <p className="text-[11px] text-white/55">London 42% · New York 38% · Asia 20%</p>
              </ExampleCard>
            </div>

            <div className="space-y-3">
              <ExampleCard title="Trader Score & Pillars">
                <div className="flex items-center gap-4">
                  <div className="grid h-16 w-16 place-items-center rounded-full border border-cyan-300/30 bg-cyan-300/10 text-lg font-semibold text-cyan-100">
                    56
                  </div>
                  <ul className="space-y-1 text-[11px] text-white/55">
                    <li>Discipline 46 · Execution 57</li>
                    <li>Risk 60 · Patience 60</li>
                  </ul>
                </div>
              </ExampleCard>
              <ExampleCard title="Learning Arc · Live">
                <p className="text-[12px] text-white/70">
                  Last 30 days: 24 helpful vs 0 off-target AXE replies — the arc follows real teaching
                  moments.
                </p>
                <p className="mt-2 text-[11px] text-white/40">
                  Trade alignment 362 · Chat quality 24 · Journal 14 — sample counts.
                </p>
              </ExampleCard>
              <ExampleCard title="Four-week rhythm">
                <div className="mt-1 flex h-12 items-end gap-1.5">
                  {[28, 42, 36, 54, 48, 61, 44, 58].map((h, i) => (
                    <span
                      key={i}
                      className="flex-1 rounded-sm bg-cyan-300/25"
                      style={{ height: `${h}%` }}
                    />
                  ))}
                </div>
              </ExampleCard>
            </div>

            <div className="space-y-3">
              <ExampleCard title="AXE Alignment">
                <p className="text-2xl font-semibold text-white">
                  48<span className="text-sm text-white/40">/100</span>
                </p>
                <p className="mt-1 text-[11px] text-white/45">
                  100 = fully aligned with how you trade — sample score.
                </p>
              </ExampleCard>
              <ExampleCard title="What You Taught It">
                <p className="text-[12px] text-white/70">Kept 5 setups · Passed 2 · 3 reasoning fixes</p>
              </ExampleCard>
              <ExampleCard title="Edge Patterns">
                <p className="text-[11px] text-white/55">Breakout + Retest 78%</p>
                <p className="text-[11px] text-white/55">Liquidity Sweep 64%</p>
                <p className="text-[11px] text-white/55">Session Open Fade 52%</p>
              </ExampleCard>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ExampleCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#07090c]/80 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">{title}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Row({
  symbol,
  note,
  change,
  up,
}: {
  symbol: string;
  note: string;
  change: string;
  up: boolean;
}) {
  return (
    <div className="mt-2 flex items-center justify-between gap-2 text-[12px]">
      <div>
        <p className="font-mono font-semibold text-white">{symbol}</p>
        <p className="text-[11px] text-white/40">{note}</p>
      </div>
      <span className={up ? "font-mono text-cyan-300" : "font-mono text-rose-300"}>{change}</span>
    </div>
  );
}
