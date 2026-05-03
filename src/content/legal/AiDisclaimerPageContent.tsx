import { LEGAL } from "@/lib/legal/constants";

export function AiDisclaimerPageContent() {
  const L = LEGAL;
  return (
    <>
      <h1>AI disclaimer</h1>
      <p>
        <strong>Effective date:</strong> {L.effectiveDate}
      </p>
      <p>AXE uses AI to help explain, summarise, organise and analyse trading-related information.</p>

      <h2>AI can be wrong</h2>
      <p>
        AI-generated responses may contain mistakes, outdated information, incomplete analysis or hallucinated details.
      </p>
      <p>Do not rely on AI output as the sole basis for trading, financial, legal, tax or business decisions.</p>

      <h2>Context-based answers</h2>
      <p>AXE may use:</p>
      <ul>
        <li>your chat messages</li>
        <li>journal entries</li>
        <li>notes</li>
        <li>connected account data</li>
        <li>trade history</li>
        <li>watchlist</li>
        <li>active symbol</li>
        <li>market context</li>
        <li>knowledge-base documents</li>
        <li>memory</li>
      </ul>
      <p>The quality of output depends on the quality and completeness of available context.</p>

      <h2>Not a signal bot</h2>
      <p>AXE is not designed to guarantee entries, exits, signals or profits.</p>
      <p>
        AXE may help you review your plan, risk, journal, mistakes, trade history and context. You remain responsible for
        your decisions.
      </p>

      <h2>Verify important information</h2>
      <p>
        You should verify market-moving news, economic releases, broker data, account rules, legal information and
        trading conditions with official or primary sources.
      </p>

      <h2>No professional advice</h2>
      <p>AXE does not provide regulated financial, investment, legal, tax or accounting advice.</p>
    </>
  );
}
