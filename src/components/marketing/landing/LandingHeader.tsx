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
      <div className="mx-auto flex max-w-6xl flex-nowrap items-center justify-between gap-2 px-3 py-3 sm:gap-3 sm:px-5 sm:py-3.5">
        <div className="flex min-w-0 items-center gap-1">
          <Link href="/" className="flex min-w-0 items-center gap-2">
            <Image
              src="/axe-companion-wordmark.png"
              alt="AXE Companion OS"
              width={1172}
              height={111}
              priority
              unoptimized
              className="h-3.5 w-auto max-w-[42vw] object-contain opacity-95 sm:h-5 sm:max-w-none"
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

        <div className="flex shrink-0 flex-nowrap items-center gap-1.5 whitespace-nowrap">
          <Link
            href="/login"
            className="inline-flex h-8 items-center whitespace-nowrap rounded-full border border-white/12 bg-white/[0.04] px-2.5 text-[11px] font-medium leading-none text-tos-muted hover:bg-white/[0.08] hover:text-tos-text sm:h-auto sm:px-3 sm:py-1.5 sm:text-xs"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="axe-landing-cta inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-full bg-gradient-to-r from-cyan-400 to-teal-400 px-2.5 text-[11px] font-semibold leading-none text-[#04161B] shadow-[0_8px_22px_-8px_rgba(34,211,238,0.55)] transition hover:from-cyan-300 hover:to-teal-300 sm:h-auto sm:px-3.5 sm:py-1.5 sm:text-xs"
          >
            <span className="sm:hidden">Start</span>
            <span className="hidden sm:inline">Get started</span>
            <ChevronRight className="hidden h-3.5 w-3.5 sm:inline" aria-hidden />
          </Link>
        </div>
      </div>
    </header>
  );
}
