import Image from "next/image";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { AppSwitcher } from "@/components/marketing/AppSwitcher";

const NAV = [
  { href: "#product", label: "Product" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
] as const;

export function LandingHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#020406]/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
        <div className="flex min-w-0 items-center gap-1.5">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/axe-companion-wordmark.png"
              alt="AXE Companion OS"
              width={1172}
              height={111}
              priority
              unoptimized
              className="h-[18px] w-auto object-contain opacity-95 sm:h-5"
              style={{ mixBlendMode: "screen" }}
            />
          </Link>
          <AppSwitcher current="companion" />
        </div>

        <nav className="hidden items-center gap-5 text-xs font-medium text-white/50 md:flex" aria-label="Landing">
          {NAV.map((item) => (
            <a key={item.href} href={item.href} className="transition hover:text-white">
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="rounded-full border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-tos-muted hover:bg-white/[0.08] hover:text-tos-text"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="axe-landing-cta inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-cyan-400 to-teal-400 px-3.5 py-1.5 text-xs font-semibold text-[#04161B] shadow-[0_8px_22px_-8px_rgba(34,211,238,0.55)] transition hover:from-cyan-300 hover:to-teal-300"
          >
            Get started
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </div>
    </header>
  );
}
