import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Offline — AXE Companion",
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-white/40">
        AXE Companion
      </p>
      <h1 className="text-lg font-semibold text-white">You&apos;re offline</h1>
      <p className="max-w-sm text-sm leading-relaxed text-white/60">
        AXE kept the last chart, feed, or chat this device opened. Reconnect to
        sync — or open a cached screen below.
      </p>
      <nav className="mt-2 flex flex-wrap items-center justify-center gap-2 text-xs">
        <Link className="rounded border border-white/15 px-3 py-1.5 text-white/85" href="/chat">
          Chat
        </Link>
        <Link className="rounded border border-white/15 px-3 py-1.5 text-white/85" href="/feed">
          Feed
        </Link>
        <Link className="rounded border border-white/15 px-3 py-1.5 text-white/85" href="/chart">
          Chart
        </Link>
        <Link className="rounded border border-white/15 px-3 py-1.5 text-white/85" href="/intel">
          Intel
        </Link>
      </nav>
    </main>
  );
}
