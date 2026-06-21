export default function LandingModularDeck() {
  return (
    <section className="py-24 px-6 border-t border-white/[0.04]">
      <div className="max-w-6xl mx-auto">
        <div className="tos-card p-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/45">
            <span className="text-white/50">⌘</span>
            Modular workspace
          </div>

          <div className="mt-5 text-4xl md:text-5xl font-bold leading-tight">
            Your terminal.
            <br />
            <span className="landing-heading-shimmer">Your rules.</span>
          </div>

          <div className="mt-4 text-sm text-white/45 max-w-2xl">
            Snap-to-grid widgets, multi-timeframe chart layouts, beginner mode with tooltips, and a session strip that shows you exactly which markets are open.
          </div>

          <ul className="mt-6 space-y-2 text-sm text-white/55">
            <li className="flex items-start gap-2">
              <span className="mt-[3px] inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-300 text-xs">
                ✓
              </span>
              <span>25+ instruments across Crypto, FX, Indices, Metals, Energy & Bonds</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-[3px] inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-300 text-xs">
                ✓
              </span>
              <span>AI-powered market commentary with voice commands</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-[3px] inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-300 text-xs">
                ✓
              </span>
              <span>Live FRED macro data, vessel & flight tracking</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-[3px] inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-300 text-xs">
                ✓
              </span>
              <span>Trade journal with 1-tap ratings and analytics</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-[3px] inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-300 text-xs">
                ✓
              </span>
              <span>Contextual Alerts, Fibonacci and Key Levels</span>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}

