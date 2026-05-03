import Link from "next/link";

const LINKS = [
  { href: "/legal", label: "Legal" },
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/risk-disclaimer", label: "Risk Disclaimer" },
  { href: "/ai-disclaimer", label: "AI Disclaimer" },
  { href: "/cookies", label: "Cookies" },
  { href: "/refunds", label: "Refunds" },
  { href: "/subprocessors", label: "Subprocessors" },
  { href: "/contact", label: "Contact" },
] as const;

type Props = {
  className?: string;
};

export function LegalNavLinks({ className }: Props) {
  return (
    <nav className={className} aria-label="Legal">
      <ul className="flex flex-wrap justify-center gap-x-3 gap-y-1.5 text-[11px] text-tos-dim">
        {LINKS.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="text-tos-muted hover:text-tos-warm hover:underline">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
