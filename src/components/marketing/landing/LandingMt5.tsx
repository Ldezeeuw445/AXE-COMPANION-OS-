import Link from "next/link";
import { Radio } from "lucide-react";

export function LandingMt5() {
  return (
    <section id="mt5" className="relative z-10 scroll-mt-24 px-5 pb-14">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-2xl border border-cyan-400/15 bg-gradient-to-r from-cyan-400/[0.04] via-cyan-400/[0.015] to-transparent p-6 md:p-8">
        <div className="absolute right-0 top-0 h-48 w-48 rounded-full bg-cyan-400/[0.05] blur-[72px]" />
        <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <Radio className="mt-0.5 h-6 w-6 shrink-0 text-cyan-300/85" aria-hidden />
            <div>
              <h3 className="text-base font-semibold text-white">MT5 link — safe, revocable, hashed</h3>
              <p className="mt-1 max-w-2xl text-sm text-tos-muted">
                Recommended path: in-app cloud MT5 connection from{" "}
                <span className="text-tos-text">Accounts</span>. Advanced: create a per-account link token
                and paste it into your EA / bridge — only a hash is stored server-side, you can revoke any
                time.
              </p>
            </div>
          </div>
          <Link
            href="/login"
            className="shrink-0 rounded-full border border-cyan-300/25 bg-cyan-300/[0.06] px-4 py-2 text-center text-xs font-medium text-cyan-100/95 transition hover:border-cyan-300/45 hover:bg-cyan-300/[0.10]"
          >
            Open Accounts after login
          </Link>
        </div>
      </div>
    </section>
  );
}
