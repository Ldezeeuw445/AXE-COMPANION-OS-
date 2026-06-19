import Image from "next/image";
import { getPublicAppBaseUrl } from "@/lib/env";

export function LandingOpenAppQr() {
  const base = getPublicAppBaseUrl();
  const isLocal = /localhost|127\.0\.0\.1/.test(base);
  const chatUrl = `${base}/chat`;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(chatUrl)}`;

  if (isLocal) {
    return (
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-5 py-6 text-center">
        <p className="text-sm font-medium text-white">Open on your phone</p>
        <p className="mt-2 text-xs text-tos-muted">
          Set <code className="rounded bg-white/10 px-1 text-[11px]">NEXT_PUBLIC_APP_URL</code> to your public URL on
          Vercel to show a QR here. Locally, open{" "}
          <code className="rounded bg-white/10 px-1 text-[11px]">{chatUrl}</code> on the same Wi‑Fi.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-5 py-6 sm:flex-row sm:justify-center sm:gap-8">
      <div className="rounded-xl border border-white/10 bg-white p-2">
        <Image src={qrSrc} alt="QR code to open Trading OS" width={200} height={200} unoptimized />
      </div>
      <div className="max-w-sm text-left text-sm text-tos-muted">
        <p className="font-medium text-white">Scan to open chat</p>
        <p className="mt-2">
          Same Supabase login after you open the link.{" "}
          <span className="text-white/80">Trading OS keeps the same workspace, whether you open it on phone or desk.</span>
        </p>
        <p className="mt-3 break-all font-mono text-[11px] text-white/45">{chatUrl}</p>
      </div>
    </div>
  );
}
