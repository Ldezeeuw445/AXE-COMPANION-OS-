import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Risk Disclaimer · AXE Companion",
};

export default function RiskDisclaimerPage() {
  return (
    <>
      <h1>Risk disclaimer</h1>
      <p>
        Trading financial instruments involves substantial risk of loss. Past performance, simulated results, or
        examples shown in AXE Companion or Trading OS materials are not indicative of future results.
      </p>
      <p>
        AXE Companion does not provide personalised investment, legal, or tax advice. You alone decide whether and how
        to trade. Only risk capital you can afford to lose.
      </p>
      <p>
        Leverage magnifies gains and losses. Market conditions, liquidity, slippage, and technical failures can affect
        execution. Review your broker&apos;s risk disclosures in addition to this notice.
      </p>
    </>
  );
}
