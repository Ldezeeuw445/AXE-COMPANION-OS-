import Link from "next/link";
import { LegalCompanyFooter } from "@/components/legal/LegalCompanyFooter";
import { LegalDraftNote } from "@/components/legal/LegalDraftNote";

export function LegalPagesShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#030406] text-tos-text antialiased">
      <div className="mx-auto max-w-3xl px-4 py-12">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
          <Link href="/" className="font-medium text-tos-warm hover:underline">
            ← AXE Companion home
          </Link>
          <Link href="/legal" className="text-tos-muted hover:text-tos-warm hover:underline">
            Legal overview
          </Link>
        </div>
        <div className="mt-4">
          <LegalDraftNote />
        </div>
        <article className="mt-8 space-y-4 text-sm leading-relaxed text-tos-muted [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-white [&_h2]:mt-8 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-white/95 [&_h3]:mt-4 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-white/90 [&_p]:text-tos-muted [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 [&_table]:w-full [&_table]:text-left [&_th]:border [&_th]:border-white/10 [&_th]:bg-white/[0.04] [&_th]:px-2 [&_th]:py-2 [&_th]:text-[10px] [&_th]:font-semibold [&_th]:text-tos-muted [&_td]:border [&_td]:border-white/10 [&_td]:px-2 [&_td]:py-2 [&_td]:align-top [&_td]:text-[11px]">
          {children}
        </article>
        <LegalCompanyFooter />
      </div>
    </div>
  );
}
