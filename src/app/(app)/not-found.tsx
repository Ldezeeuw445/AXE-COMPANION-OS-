import Link from "next/link";
import { Compass } from "lucide-react";

export default function AppNotFound() {
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center px-6 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.06]">
        <Compass className="h-8 w-8 text-cyan-400" />
      </div>
      <h2 className="mb-2 text-lg font-semibold text-white">
        Page not found
      </h2>
      <p className="mb-6 max-w-sm text-sm text-tos-muted">
        This route doesn&apos;t exist in the AXE Companion.
      </p>
      <Link
        href="/chat"
        className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/[0.08] active:bg-white/[0.10]"
      >
        Back to AXE
      </Link>
    </div>
  );
}
