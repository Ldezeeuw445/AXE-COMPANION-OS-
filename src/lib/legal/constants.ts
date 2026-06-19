/**
 * Legal entity placeholders — Trading OS is the company; Trading OS is the product.
 * Draft — needs legal review (see LegalDraftNote in UI).
 * Do not publish a private home address; keep [BUSINESS ADDRESS] until a business address is confirmed.
 */
export const LEGAL = {
  companyLegalName: "Trading OS",
  tradeNames: "Trading OS / Trading OS",
  kvk: "74239422",
  vat: "NL002314900B21",
  /** Intentionally left as placeholder until a statutory business address is chosen. */
  businessAddress: "[BUSINESS ADDRESS]",
  contactEmail: "support@tradingosapp.com",
  supportEmail: "support@tradingosapp.com",
  privacyEmail: "support@tradingosapp.com",
  /** Replace with confirmed launch date after counsel review. */
  effectiveDate: "30 April 2026 (confirm at launch)",
  governingLaw: "Netherlands",
  jurisdiction:
    "the competent courts of the Netherlands, unless mandatory consumer protection law provides otherwise",
} as const;

export const LEGAL_COPY = {
  signupCheckbox:
    "I agree to the Terms and Privacy Policy and understand that AXE does not provide financial advice.",
  chatDisclaimer:
    "AXE provides educational and analytical support only. You remain responsible for your own trading decisions.",
  mt5Connect:
    "Use read-only/investor access where possible. AXE uses connected account data for analytics, journaling and context. AXE does not place trades by default.",
  pricing:
    "Prices may exclude taxes. Subscriptions renew automatically until cancelled. You can cancel before the next billing period.",
  tradingShort:
    "Trading involves risk. Past performance does not guarantee future results. AXE does not guarantee profits.",
} as const;
