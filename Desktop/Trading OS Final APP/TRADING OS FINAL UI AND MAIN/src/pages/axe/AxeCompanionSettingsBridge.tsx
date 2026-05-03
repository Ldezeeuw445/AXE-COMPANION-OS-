import { useEffect } from "react";
import { Link } from "react-router-dom";

/**
 * AXE standalone: /settings → opens Next.js Companion /settings when
 * VITE_AXE_COMPANION_URL is set (same pattern as the install QR dialog).
 */
export default function AxeCompanionSettingsBridge() {
  const base = import.meta.env.VITE_AXE_COMPANION_URL?.trim();

  useEffect(() => {
    if (!base) return;
    try {
      const u = new URL(base);
      window.location.replace(`${u.origin}/settings`);
    } catch {
      /* invalid URL — show fallback below */
    }
  }, [base]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0d0d10] px-6 text-center text-white">
      {base ? (
        <p className="text-sm text-white/70">Redirecting to Companion settings…</p>
      ) : (
        <>
          <p className="max-w-md text-sm text-white/70">
            Set{" "}
            <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs">
              VITE_AXE_COMPANION_URL
            </code>{" "}
            in your Vercel env (public URL of the Next.js Companion, e.g.{" "}
            <code className="rounded bg-white/10 px-1 text-xs">https://…vercel.app/chat</code>
            ) and redeploy.
          </p>
          <Link to="/" className="text-sm text-cyan-400 underline">
            Back to landing
          </Link>
        </>
      )}
    </div>
  );
}
