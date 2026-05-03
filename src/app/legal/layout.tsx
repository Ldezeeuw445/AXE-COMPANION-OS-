import Link from "next/link";
import { LegalCompanyFooter } from "@/components/legal/LegalCompanyFooter";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#030406] text-tos-text antialiased">
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Link href="/" className="text-xs font-medium text-tos-warm hover:underline">
          ← AXE Companion home
        </Link>
        <article className="mt-8 space-y-4 text-sm leading-relaxed text-tos-muted [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-white [&_h2]:mt-8 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-white/95 [&_p]:text-tos-muted [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
          {children}
        </article>
        <LegalCompanyFooter />
      </div>
    </div>
  );
}
