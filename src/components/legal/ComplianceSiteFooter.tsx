import { LEGAL, RISK_WARNING } from "@/lib/legal/constants";
import { LegalNavLinks } from "@/components/legal/LegalNavLinks";

type Props = {
  className?: string;
  /** Optional tagline above the risk warning. */
  tagline?: string;
};

/**
 * Unified site footer: risk warning, company details (KvK/BTW/address/support), legal links.
 */
export function ComplianceSiteFooter({ className = "", tagline }: Props) {
  return (
    <footer
      className={`border-t border-white/[0.06] px-5 py-8 text-center text-[11px] text-tos-dim ${className}`}
    >
      {tagline ? <p className="font-medium text-tos-muted">{tagline}</p> : null}
      <p className={tagline ? "mt-3 leading-relaxed" : "leading-relaxed"}>{RISK_WARNING}</p>
      <div className="mx-auto mt-5 max-w-lg space-y-1 text-[10.5px] leading-relaxed text-tos-muted">
        <p className="font-medium text-tos-text">{LEGAL.companyLegalName}</p>
        <p>Trade names: {LEGAL.tradeNames}</p>
        <p>
          KvK {LEGAL.kvk} · BTW {LEGAL.vat}
        </p>
        <p>{LEGAL.businessAddress}</p>
        <p>
          <a href={`mailto:${LEGAL.supportEmail}`} className="text-tos-warm hover:underline">
            {LEGAL.supportEmail}
          </a>
        </p>
      </div>
      <LegalNavLinks className="mt-6" />
    </footer>
  );
}
