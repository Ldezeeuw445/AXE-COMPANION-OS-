/**
 * Placeholder for a recorded real session.
 * Needs Luka to record: connect account → pull trade → ask AXE → journal → notification.
 * Do not fake demo footage here.
 */
export function LandingDemoSession() {
  return (
    <section
      id="demo-session"
      className="relative z-10 scroll-mt-24 border-t border-white/[0.04] px-5 py-14 md:py-20"
    >
      <div className="mx-auto max-w-4xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-200/80">
          Real session
        </p>
        <h2 className="mt-3 text-3xl font-bold text-white md:text-4xl">
          One complete run — not a mock.
        </h2>
        <p className="mt-3 max-w-2xl text-sm text-tos-muted">
          The strongest proof is a single recorded path through the live product: connect a broker
          account, pull a real trade, ask AXE with your own rules, update the journal, and receive a
          notification. We will not substitute synthetic UI for that.
        </p>

        <div className="axe-landing-card-glow mt-8 overflow-hidden">
          <div className="flex aspect-video flex-col items-center justify-center gap-3 bg-[#08080c] px-6 text-center">
            <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-100">
              Recording slot — needs Luka
            </span>
            <p className="max-w-md text-sm text-white/70">
              Placeholder for an embedded recording of a real AXE Companion session. Until that file
              exists, this section stays empty on purpose — no staged demo data.
            </p>
            <ol className="mt-2 max-w-lg list-decimal space-y-1 pl-5 text-left text-[12px] text-tos-dim">
              <li>Connect MT5 (MetaApi) or Alpaca</li>
              <li>Pull / sync a live trade</li>
              <li>Ask AXE with account rules pinned</li>
              <li>Label the journal row</li>
              <li>Show the push / in-app notification</li>
            </ol>
            <p className="mt-3 text-[11px] text-white/35">
              {/* TODO(Luka): drop the recorded file (mp4/webm) into public/marketing/ and wire the
                  player here. */}
              TODO for Luka: record the session and wire the media here.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
