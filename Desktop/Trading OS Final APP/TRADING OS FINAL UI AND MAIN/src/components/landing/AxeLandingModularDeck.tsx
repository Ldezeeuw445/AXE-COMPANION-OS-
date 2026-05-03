export default function AxeLandingModularDeck() {
  return (
    <section className="py-24 px-6 border-t border-white/[0.04]">
      <div className="max-w-6xl mx-auto">
        <div className="tos-card p-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/45">
            <span className="text-white/50">⌘</span>
            Engine-first workspace
          </div>

          <div className="mt-5 text-4xl md:text-5xl font-bold leading-tight">
            Your accounts.
            <br />
            <span className="landing-heading-shimmer">Your audit trail.</span>
          </div>

          <div className="mt-4 text-sm text-white/45 max-w-2xl">
            AXE is designed around broker truth: fills land in Supabase, you label the story, analytics stay aligned with the account you care about. Trading OS — our upcoming premium trading terminal — will read the same spine for live charts, market intelligence, and the full desk when it launches.
          </div>

          <ul className="mt-6 space-y-2 text-sm text-white/55">
            <li className="flex items-start gap-2">
              <span className="mt-[3px] inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-300 text-xs">
                ✓
              </span>
              <span>Per-account MT5 ingest token (no secrets in the browser)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-[3px] inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-300 text-xs">
                ✓
              </span>
              <span>Idempotent trade upserts keyed by external trade id</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-[3px] inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-300 text-xs">
                ✓
              </span>
              <span>Journal labels + optional notes, scoped to the active account</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-[3px] inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-300 text-xs">
                ✓
              </span>
              <span>Same visual language as Trading OS (upcoming premium terminal) — ship AXE standalone first, same account later</span>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
