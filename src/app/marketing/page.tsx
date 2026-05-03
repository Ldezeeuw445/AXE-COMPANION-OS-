import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Marketing · TradingOS Companion",
  robots: { index: false, follow: false },
};

const links = [
  {
    href: "/marketing/ui-premium",
    title: "Desktop command desk + AXE",
    hint: "Trading OS-layout, ticker, kaarten en AXE in hetzelfde glas — premium kleur/diepte.",
  },
  {
    href: "/marketing/screenshots",
    title: "Phone frames (export)",
    hint: "Vijf telefoon-composities + uitleg voor PNG-export met Playwright.",
  },
  {
    href: "/marketing/poster",
    title: "Combined poster",
    hint: "Logo + meerdere phones op één poster (ook voor marketing-all.png).",
  },
] as const;

export default function MarketingHubPage() {
  return (
    <div className="mx-auto max-w-lg px-6 py-16 sm:py-20">
      <p className="text-[10px] font-medium uppercase tracking-[0.32em] text-tos-warm">
        Internal
      </p>
      <h1 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">
        Marketing & previews
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-white/55">
        Geen link in de app-navigatie — typ de URL in de browser of open vanaf
        de loginpagé onderaan. Zorg dat{" "}
        <code className="rounded bg-white/10 px-1.5 py-0.5 text-[11px] text-white/85">
          npm run dev
        </code>{" "}
        in deze map draait (
        <code className="rounded bg-white/10 px-1.5 py-0.5 text-[11px] text-white/85">
          tradingos-companion
        </code>
        ).
      </p>

      <ul className="mt-10 space-y-3">
        {links.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="block rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 transition-colors hover:border-white/16 hover:bg-white/[0.06]"
            >
              <span className="font-semibold text-white">{item.title}</span>
              <span className="mt-1 block text-sm text-white/50">
                {item.hint}
              </span>
              <span className="mt-2 inline-block font-mono text-[11px] text-tos-warm/90">
                {item.href}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-12 border-t border-white/10 pt-8 text-center text-[11px] text-white/35">
        PNG’s staan in{" "}
        <code className="rounded bg-white/10 px-1 py-0.5 text-white/70">
          public/marketing/
        </code>
      </p>
    </div>
  );
}
