import { LEGAL } from "@/lib/legal/constants";

export function TermsPageContent() {
  const L = LEGAL;
  return (
    <>
      <h1>Terms of Service</h1>
      <p>
        <strong>Effective date:</strong> {LEGAL.effectiveDate}
      </p>
      <p>
        These Terms of Service apply to Trading OS, Trading OS and related websites, applications, APIs,
        dashboards, account tools, AI features, journal features, trading-account integrations and any connected
        services provided by {L.companyLegalName}, trading as Trading OS and/or Trading OS.
      </p>
      <p>
        By creating an account, using the app, starting a subscription or accessing our services, you agree to these
        Terms.
      </p>

      <h2>1. Who we are</h2>
      <p>
        <strong>Provider:</strong> {L.companyLegalName}
        <br />
        <strong>KvK:</strong> {L.kvk}
        <br />
        <strong>VAT:</strong> {L.vat}
        <br />
        <strong>Address:</strong> {L.businessAddress}
        <br />
        <strong>Contact:</strong>{" "}
        <a href={`mailto:${L.contactEmail}`} className="text-tos-warm hover:underline">
          {L.contactEmail}
        </a>
      </p>

      <h2>2. What Trading OS is</h2>
      <p>
        Trading OS is an AI-powered trading intelligence and journaling assistant. It helps users structure trading
        notes, review trades, analyse trading behaviour, connect trading accounts for analytics, and build a personal
        trading memory.
      </p>
      <p>
        Trading OS may use user-provided data, journal entries, connected account data, trading history, watchlists,
        notes, market context and knowledge-base content to generate analytical and educational output.
      </p>
      <p>Trading OS is not a broker, exchange, asset manager, investment adviser or financial adviser.</p>

      <h2>3. What Trading OS is</h2>
      <p>
        Trading OS is our upcoming premium trading terminal. It is intended to provide live charts, market
        intelligence, watchlists, alerts, account context, execution workspace integrations and AXE-powered
        intelligence.
      </p>
      <p>
        Trading OS may be launched separately, with separate features, pricing or access rules. Trading OS may work
        standalone before Trading OS is available.
      </p>

      <h2>4. No financial advice</h2>
      <p>Our services provide educational, analytical and informational support only.</p>
      <p>
        We do not provide regulated investment advice, portfolio management, asset management, personalised financial
        advice, tax advice or legal advice.
      </p>
      <p>
        You are solely responsible for your trading decisions. You should not rely on Trading OS, Trading OS, AI
        outputs, analytics, market data, journal insights or alerts as the sole basis for any trading or investment
        decision.
      </p>
      <p>We do not guarantee profits, performance, accuracy, availability of market data or trading outcomes.</p>

      <h2>5. Trading risk</h2>
      <p>
        Trading financial instruments, including forex, CFDs, crypto, commodities, indices, futures and leveraged
        products, involves significant risk. You can lose part or all of your capital.
      </p>
      <p>
        Past performance, backtests, journal statistics, AI analysis or historical results do not guarantee future
        results.
      </p>
      <p>You are responsible for understanding the rules of any broker, prop firm, funded account or trading platform you use.</p>

      <h2>6. Account registration</h2>
      <p>You must provide accurate account information and keep your login credentials secure.</p>
      <p>You are responsible for all activity under your account unless caused by our proven security failure.</p>
      <p>You must notify us immediately if you suspect unauthorised access.</p>

      <h2>7. Acceptable use</h2>
      <p>You may not:</p>
      <ul>
        <li>use the services for unlawful purposes;</li>
        <li>attempt to reverse engineer, scrape, overload or attack the services;</li>
        <li>abuse free-tier usage limits;</li>
        <li>share your account with others unless explicitly allowed;</li>
        <li>upload malicious code or unlawful content;</li>
        <li>use the services to mislead others;</li>
        <li>use AXE outputs as guaranteed trading signals or represent them as licensed financial advice.</li>
      </ul>
      <p>We may suspend or terminate access if we reasonably believe these Terms are breached.</p>

      <h2>8. AI features</h2>
      <p>AI-generated output may be wrong, incomplete, outdated or unsuitable for your situation.</p>
      <p>You must independently verify important information before acting on it.</p>
      <p>
        AI features may use context from your journal, trade history, notes, memory, connected accounts and market
        context. You control what you connect or add, subject to product functionality.
      </p>

      <h2>9. Connected trading accounts</h2>
      <p>
        Trading OS may allow you to connect trading accounts such as MT5 accounts through supported methods,
        including cloud connectors or local bridge/token flows.
      </p>
      <p>
        Where possible, use read-only or investor access for analytics. We do not recommend giving trading permission
        unless a future execution feature explicitly requires it and you understand the risk.
      </p>
      <p>
        Connected-account data may include account metadata, balance/equity snapshots, open positions, trade history,
        symbols, timestamps, P&amp;L, fees and related analytics.
      </p>
      <p>
        We are not responsible for broker outages, incorrect broker data, third-party API limitations, delayed sync,
        rejected connections or platform restrictions.
      </p>

      <h2>10. Execution and orders</h2>
      <p>Trading OS does not execute trades by default.</p>
      <p>
        If Trading OS or AXE later offers execution-related features, those features will require explicit setup, safety
        controls and additional terms. Until such features are clearly enabled, buttons, panels or execution interfaces
        may be disabled or informational only.
      </p>

      <h2>11. Subscriptions, free plan and billing</h2>
      <p>Trading OS may offer a Free plan and paid plans.</p>
      <p>
        <strong>Free plan example:</strong> 20 AI queries per period, unless changed.
      </p>
      <p>
        <strong>Pro plan example:</strong> €19/month, unless changed. Features may include increased or unlimited AI
        usage, account insights, journal analytics, memory and advanced context.
      </p>
      <p>Paid subscriptions renew automatically until cancelled. Prices may exclude VAT or other taxes where applicable.</p>
      <p>
        Payments may be handled by Stripe or another payment provider. Payment providers process payment data under
        their own terms and privacy notices.
      </p>

      <h2>12. Cancellation</h2>
      <p>
        You can cancel a subscription through the account, billing portal or support process made available to you.
      </p>
      <p>Cancellation normally stops renewal at the end of the current billing period, unless otherwise stated.</p>
      <p>We do not guarantee refunds for partial months unless required by law or stated in our refund policy.</p>

      <h2>13. Right of withdrawal / digital services</h2>
      <p>
        If you are an EU consumer, you may have a statutory right of withdrawal for online purchases. For digital
        services or digital content, this right may be affected once you request immediate access or start using the
        service, depending on applicable law and the consent/acknowledgement flow at checkout.
      </p>
      <p>Details are explained in the Refund and Cancellation Policy.</p>

      <h2>14. Data and privacy</h2>
      <p>Your use of the services is subject to our Privacy Policy.</p>
      <p>
        We process personal data such as account data, profile data, broker metadata, trade history, journal entries,
        notes, chat messages, AI memory, device data, subscription data and usage data as described in the Privacy Policy.
      </p>

      <h2>15. Third-party services</h2>
      <p>
        The services may depend on third parties such as Supabase, OpenAI, Stripe, Vercel, Cloudflare, MetaApi, brokers,
        market-data providers, analytics providers or other integrations.
      </p>
      <p>We are not responsible for the availability, accuracy, policies or outages of third-party services.</p>

      <h2>16. Availability</h2>
      <p>We aim to keep the services reliable, but we do not guarantee uninterrupted or error-free availability.</p>
      <p>
        Market data, AI output, broker sync, connected accounts, alerts and live features may be delayed, unavailable,
        inaccurate or rate-limited.
      </p>

      <h2>17. Intellectual property</h2>
      <p>
        The services, software, designs, brand assets, content, models, workflows, UI, documentation and product
        concepts are owned by us or our licensors.
      </p>
      <p>
        You may not copy, resell, distribute or create competing services from our protected materials except as
        permitted by law.
      </p>
      <p>
        You retain ownership of your uploaded content, notes, journal entries and trading data. You grant us the rights
        needed to process and display that data to provide the services.
      </p>

      <h2>18. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, we are not liable for trading losses, lost profits, lost opportunities,
        financial losses, market losses, broker issues, data inaccuracies, AI errors, service interruptions or
        third-party failures.
      </p>
      <p>Nothing in these Terms limits liability that cannot legally be limited.</p>

      <h2>19. Termination</h2>
      <p>You may stop using the services at any time.</p>
      <p>
        We may suspend or terminate accounts if required by law, for security reasons, non-payment, misuse or breach of
        these Terms.
      </p>

      <h2>20. Changes to the services or terms</h2>
      <p>We may update features, pricing, these Terms or related policies. If changes are material, we will take reasonable steps to notify users.</p>
      <p>Continuing to use the services after changes means you accept the updated Terms.</p>

      <h2>21. Governing law</h2>
      <p>
        These Terms are governed by the laws of {L.governingLaw}, unless mandatory consumer protection law says
        otherwise.
      </p>
      <p>Disputes are submitted to {L.jurisdiction}.</p>

      <h2>22. Contact</h2>
      <p>
        Questions about these Terms:{" "}
        <a href={`mailto:${L.contactEmail}`} className="text-tos-warm hover:underline">
          {L.contactEmail}
        </a>
      </p>
    </>
  );
}
