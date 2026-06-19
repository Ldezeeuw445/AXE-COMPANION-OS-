import { LEGAL } from "@/lib/legal/constants";

export function RiskDisclaimerPageContent() {
  const L = LEGAL;
  return (
    <>
      <h1>Risk disclaimer</h1>
      <p>
        <strong>Effective date:</strong> {L.effectiveDate}
      </p>
      <p>
        Trading OS and Trading OS provide educational, analytical and informational tools for traders. They do not
        provide licensed financial advice, investment advice, portfolio management, asset management, tax advice or
        legal advice.
      </p>

      <h2>Trading is risky</h2>
      <p>
        Trading financial instruments can result in significant losses. This includes forex, CFDs, commodities, crypto,
        indices, futures, stocks, options and leveraged products.
      </p>
      <p>You may lose part or all of your capital. Leveraged products can amplify losses.</p>

      <h2>No profit guarantee</h2>
      <p>We do not guarantee:</p>
      <ul>
        <li>profits</li>
        <li>trading success</li>
        <li>improved performance</li>
        <li>accuracy of analysis</li>
        <li>accuracy of market data</li>
        <li>accuracy of AI output</li>
        <li>execution outcomes</li>
        <li>prop firm/funded account success</li>
      </ul>
      <p>
        Past performance, backtests, journal analytics, historical data or AI-generated analysis do not guarantee future
        results.
      </p>

      <h2>No personalised investment advice</h2>
      <p>
        AXE may analyse your trading history, journal, behaviour and context. This is intended for educational and
        analytical support.
      </p>
      <p>
        You remain responsible for deciding whether any trade, setup, position size, risk level or strategy is
        appropriate for you.
      </p>

      <h2>Market data and AI limitations</h2>
      <p>Market data may be delayed, incomplete, inaccurate or unavailable.</p>
      <p>AI output may be wrong, incomplete, outdated or unsuitable for your situation.</p>
      <p>Always verify important information independently.</p>

      <h2>Prop firms and broker rules</h2>
      <p>
        If you trade funded accounts or prop firm challenges, you are responsible for understanding and following their
        rules, including drawdown, consistency, news trading, HFT, scalping, lot size, copy trading, IP/VPN and payout
        rules.
      </p>
      <p>AXE may help you track rules, but does not guarantee compliance.</p>

      <h2>Execution</h2>
      <p>
        Trading OS does not execute trades by default. If execution features are added later, they require explicit
        configuration and safety controls.
      </p>
      <p>You are responsible for every order placed through any connected broker, platform or bridge.</p>
    </>
  );
}
