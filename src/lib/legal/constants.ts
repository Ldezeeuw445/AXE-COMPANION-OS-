/**
 * Legal entity — Trading OS is the provider; AXE Companion is the product.
 * Replace businessAddress with the statutory registered office before public launch.
 */
export const LEGAL = {
  companyLegalName: "Trading OS",
  tradeNames: "AXE Companion / Trading OS",
  kvk: "74239422",
  vat: "NL002314900B21",
  /** Statutory business address — replace with confirmed registered office. */
  businessAddress: "Doorzwin 5032, 1788 SC Julianadorp, Netherlands",
  contactEmail: "support@tradingosapp.com",
  supportEmail: "support@tradingosapp.com",
  privacyEmail: "support@tradingosapp.com",
  effectiveDate: "30 April 2026",
  governingLaw: "Netherlands",
  jurisdiction:
    "the competent courts of the Netherlands, unless mandatory consumer protection law provides otherwise",
} as const;

/** Mandatory risk warning — footer, login, and onboarding surfaces. */
export const RISK_WARNING =
  "Trading financial instruments involves high risk. AXE Companion does not guarantee profits. Past performance is no guarantee of future results. Our software is for educational and analytical purposes only. You operate the software at your own financial risk." as const;

export const LEGAL_COPY = {
  signupCheckbox:
    "I agree to the Terms and Privacy Policy and understand that AXE Companion is analytical software only — not a financial adviser or broker.",
  chatDisclaimer:
    "AXE provides educational and analytical support only. You remain responsible for your own trading decisions.",
  mt5Connect:
    "Use read-only/investor access where possible. AXE uses connected account data for analytics, journaling and context. Order execution requires explicit Live Trading activation and per-order confirmation.",
  pricing:
    "Prices may exclude taxes. Subscriptions renew automatically until cancelled. You can cancel before the next billing period.",
  tradingShort:
    "Trading involves risk. Past performance does not guarantee future results. AXE does not guarantee profits.",
  metaApiCheckbox1:
    "I agree to the Algemene Voorwaarden and the Privacy Policy.",
  metaApiCheckbox2:
    "I understand that AXE Companion is a software tool and NOT a financial adviser or broker. All trades executed via the MetaAPI connection are entirely my own responsibility.",
  metaApiCheckbox3:
    "I confirm that I explicitly authorise AXE Companion to forward orders to my broker using the API credentials I provide.",
} as const;

/** Form field names for the three MetaAPI compliance checkboxes (server + client). */
export const META_API_COMPLIANCE_FIELDS = {
  terms: "metaApiTermsConfirm",
  softwareTool: "metaApiSoftwareToolConfirm",
  orderForward: "metaApiOrderForwardConfirm",
} as const;
