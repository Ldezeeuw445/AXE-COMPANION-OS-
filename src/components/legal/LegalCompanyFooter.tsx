import { LEGAL } from "@/lib/legal/constants";

export function LegalCompanyFooter() {
  return (
    <footer className="mt-16 border-t border-white/10 pt-8 text-[11px] leading-relaxed text-tos-dim">
      <p className="font-medium text-tos-muted">{LEGAL.companyLegalName}</p>
      <p className="mt-1 text-tos-muted">Trade names: {LEGAL.tradeNames}</p>
      <p className="mt-2">
        KvK {LEGAL.kvk} · VAT {LEGAL.vat}
        <br />
        <a href={`mailto:${LEGAL.supportEmail}`} className="text-tos-warm hover:underline">
          {LEGAL.supportEmail}
        </a>
      </p>
      <p className="mt-2 text-tos-dim/90">
        Business address: <span className="font-mono text-tos-muted">{LEGAL.businessAddress}</span>
      </p>
    </footer>
  );
}
