import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Legal · Trading OS",
  description: "Terms, privacy, risk and AI disclaimers, cookies, refunds, subprocessors and contact.",
};

const LINKS = [
  { href: "/terms", label: "Terms of Service" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/risk-disclaimer", label: "Risk disclaimer" },
  { href: "/ai-disclaimer", label: "AI disclaimer" },
  { href: "/cookies", label: "Cookie policy" },
  { href: "/refunds", label: "Refunds & cancellation" },
  { href: "/subprocessors", label: "Subprocessors" },
  { href: "/contact", label: "Contact" },
] as const;

export default function LegalIndexPage() {
  return (
    <>
      <h1>Legal</h1>
      <p>Policies for Trading OS and Trading OS (operated by Trading OS). Draft — needs legal review.</p>
      <ul className="mt-6 space-y-2">
        {LINKS.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="text-tos-warm hover:underline">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
