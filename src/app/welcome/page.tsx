import Image from "next/image";
import Link from "next/link";
import { getPublicAppBaseUrl } from "@/lib/env";

export const metadata = {
  title: "AXE Companion — welcome",
  description:
    "AXE with knowledge layer, accounts, and chat. Add to your home screen or sign in.",
};

export default function WelcomePage() {
  const base = getPublicAppBaseUrl();
  const chatUrl = `${base}/chat`;
  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(chatUrl)}`;

  return (
    <div className="relative flex min-h-dvh flex-col items-center overflow-hidden px-6 py-14 pb-24">
      <div
        className="pointer-events-none absolute left-1/2 top-[22%] -translate-x-1/2 -translate-y-1/2"
        aria-hidden
      >
        <div
          className="rounded-[50%]"
          style={{
            width: 420,
            height: 180,
            background:
              "radial-gradient(ellipse at center, rgba(46,196,182,0.12) 0%, transparent 70%)",
          }}
        />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-md text-center">
        <Image
          src="/axe-companion-wordmark.png"
          alt="AXE Companion"
          width={420}
          height={80}
          priority
          unoptimized
          className="mx-auto h-auto w-[280px] object-contain"
          style={{ mixBlendMode: "screen" }}
        />
        <p className="mt-4 text-sm leading-relaxed text-tos-muted">
          Your personal trading copilot with memory and knowledge — on your phone. Optionally link broker/MT5 later;
          no desktop terminal required to start.
        </p>

        <p className="mt-4 text-center">
          <Link
            href="/"
            className="text-[11px] font-medium text-tos-accent-cyan/90 hover:underline"
          >
            ← Back to home
          </Link>
        </p>

        <div className="mt-8 flex flex-col gap-3">
          <Link
            href="/login"
            className="rounded-2xl bg-gradient-to-r from-tos-warm/90 to-teal-500/90 py-3.5 text-center text-sm font-semibold text-[#06070a] shadow-lg shadow-teal-900/30"
          >
            Log in / get started
          </Link>
          <Link
            href="/chat"
            className="rounded-2xl border border-white/15 py-3 text-center text-sm font-medium text-tos-text hover:bg-white/5"
          >
            Go to chat (if already signed in)
          </Link>
        </div>

        <div className="mt-10 rounded-2xl border border-white/10 bg-tos-surface-928/50 p-5 text-left">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-tos-warm">
            On your phone — no App Store required
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-4 text-xs leading-relaxed text-tos-muted">
            <li>
              <strong className="text-tos-text">iPhone (Safari):</strong> Share →{" "}
              <em>Add to Home Screen</em>.
            </li>
            <li>
              <strong className="text-tos-text">Android (Chrome):</strong> Menu →{" "}
              <em>Install app</em> or <em>Add to Home screen</em>.
            </li>
          </ul>
          <p className="mt-3 text-[11px] text-tos-dim">
            Then open AXE from your home screen; sign-in stays on Supabase.
          </p>
        </div>

        <div className="mt-8 flex flex-col items-center gap-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-tos-dim">
            Scan to open chat
          </p>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="" width={220} height={220} className="rounded-lg" />
          </div>
          <p className="max-w-full break-all text-center font-mono text-[10px] text-tos-dim">
            {chatUrl}
          </p>
        </div>
      </div>
    </div>
  );
}
