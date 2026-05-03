export function LegalCompanyFooter() {
  return (
    <footer className="mt-16 border-t border-white/10 pt-8 text-[11px] leading-relaxed text-tos-dim">
      <p className="font-medium text-tos-muted">Trading OS</p>
      <p className="mt-2">
        KvK 74239422 · VAT NL002314900B21
        <br />
        <a href="mailto:support@tradingosapp.com" className="text-tos-warm hover:underline">
          support@tradingosapp.com
        </a>
      </p>
      <p className="mt-2 text-tos-dim/90">
        Registered business address: available on written request (placeholder — replace with full statutory address
        when published).
      </p>
    </footer>
  );
}
