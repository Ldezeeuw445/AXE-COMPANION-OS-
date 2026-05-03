import Link from "next/link";

const LINKS = [
  { href: "/legal/terms", label: "Terms" },
  { href: "/legal/privacy", label: "Privacy" },
  { href: "/legal/risk", label: "Risk" },
  { href: "/legal/ai-disclaimer", label: "AI" },
  { href: "/legal/cookies", label: "Cookies" },
  { href: "/legal/refunds", label: "Refunds" },
  { href: "/legal/subprocessors", label: "Subprocessors" },
  { href: "/legal/contact", label: "Contact" },
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
