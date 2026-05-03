import { LEGAL } from "@/lib/legal/constants";

export function PrivacyPageContent() {
  const L = LEGAL;
  return (
    <>
      <h1>Privacy Policy</h1>
      <p>
        <strong>Effective date:</strong> {L.effectiveDate}
      </p>
      <p>
        This Privacy Policy explains how {L.companyLegalName}, trading as AXE Companion and/or Trading OS, processes
        personal data when you use our websites, apps, dashboards, AI features, account tools, journal features and
        connected services.
      </p>

      <h2>1. Controller</h2>
      <p>
        <strong>Controller:</strong> {L.companyLegalName}
        <br />
        <strong>KvK:</strong> {L.kvk}
        <br />
        <strong>VAT:</strong> {L.vat}
        <br />
        <strong>Address:</strong> {L.businessAddress}
        <br />
        <strong>Privacy contact:</strong>{" "}
        <a href={`mailto:${L.privacyEmail}`} className="text-tos-warm hover:underline">
          {L.privacyEmail}
        </a>
      </p>

      <h2>2. Personal data we process</h2>
      <p>We may process:</p>
      <h3>Account and identity data</h3>
      <ul>
        <li>email address</li>
        <li>user ID</li>
        <li>login/session data</li>
        <li>profile name</li>
        <li>account settings</li>
        <li>onboarding answers</li>
      </ul>
      <h3>Subscription and payment data</h3>
      <ul>
        <li>subscription plan</li>
        <li>billing status</li>
        <li>Stripe/customer identifiers</li>
        <li>invoices/payment status</li>
        <li>VAT/country information where needed</li>
      </ul>
      <p>We do not store full card details ourselves.</p>
      <h3>Trading account metadata</h3>
      <ul>
        <li>connected account label</li>
        <li>provider</li>
        <li>masked login</li>
        <li>server/broker name</li>
        <li>connection method</li>
        <li>provider status</li>
        <li>sync timestamps</li>
        <li>account snapshots where available</li>
      </ul>
      <h3>Trade and journal data</h3>
      <ul>
        <li>symbols</li>
        <li>side/direction</li>
        <li>size/volume</li>
        <li>open/close time</li>
        <li>open/close price</li>
        <li>P&amp;L</li>
        <li>fees/commission/swap</li>
        <li>trade tags/labels</li>
        <li>journal notes</li>
        <li>screenshots/attachments if supported</li>
        <li>strategy tags and review ratings</li>
      </ul>
      <h3>Chat and AI data</h3>
      <ul>
        <li>chat messages</li>
        <li>prompts</li>
        <li>AI responses</li>
        <li>AXE memory</li>
        <li>user rules</li>
        <li>knowledge preferences</li>
        <li>active symbol/account context used for responses</li>
      </ul>
      <h3>Notes and watchlist data</h3>
      <ul>
        <li>notes</li>
        <li>tags</li>
        <li>watchlists</li>
        <li>symbols</li>
        <li>alerts</li>
        <li>preferences</li>
      </ul>
      <h3>Technical and usage data</h3>
      <ul>
        <li>IP address</li>
        <li>device/browser data</li>
        <li>app logs</li>
        <li>error logs</li>
        <li>feature usage</li>
        <li>usage counters</li>
        <li>cookies/session identifiers</li>
        <li>security logs</li>
      </ul>
      <h3>Market/context data</h3>
      <p>
        Where relevant, we may store or cache market context, news context, macro context or analysis snapshots linked to
        your workspace.
      </p>

      <h2>3. How we collect data</h2>
      <ul>
        <li>directly from you;</li>
        <li>through your use of the app;</li>
        <li>from connected accounts or integrations you authorise;</li>
        <li>from payment providers;</li>
        <li>from authentication and hosting infrastructure;</li>
        <li>from support communication.</li>
      </ul>

      <h2>4. Purposes and legal bases</h2>
      <p>
        <strong>Provide the service</strong> — Legal basis: contract. Account access, app functionality, journal, chat,
        connected accounts, analytics, alerts, account sync.
      </p>
      <p>
        <strong>Improve and secure the service</strong> — Legal basis: legitimate interests. Debugging, abuse prevention,
        security logging, performance improvements, service reliability.
      </p>
      <p>
        <strong>Personalise AXE output</strong> — Legal basis: contract and/or legitimate interests. Using journal,
        memory, trades and preferences to provide relevant responses.
      </p>
      <p>
        <strong>Billing and subscription management</strong> — Legal basis: contract and legal obligations. Payment status,
        invoices, tax records, subscription access.
      </p>
      <p>
        <strong>Legal compliance</strong> — Legal basis: legal obligation. Accounting, tax obligations, lawful requests,
        compliance records.
      </p>
      <p>
        <strong>Marketing communication</strong> — Legal basis: consent or legitimate interests where allowed. Product
        updates, waitlist communication, launch news, marketing emails where permitted.
      </p>

      <h2>5. AI processing</h2>
      <p>
        AXE may use your chat messages, journal entries, trade history, notes, memory, active account, watchlist and
        market context to produce responses.
      </p>
      <p>
        AI outputs may be generated through third-party AI providers such as OpenAI or similar providers. We aim to send
        only the data needed to provide the requested AI feature.
      </p>
      <p>Do not enter highly sensitive personal information into the chat unless necessary.</p>

      <h2>6. Broker and MT5 data</h2>
      <p>
        If you connect a broker or MT5 account, we process the data needed for analytics, journal, account insights and
        AXE context.
      </p>
      <p>
        Where possible, use read-only/investor access. We do not store raw passwords in normal frontend storage.
        Server-side providers or secure functions may process credentials for connection setup where required.
      </p>

      <h2>7. Sharing with processors and subprocessors</h2>
      <p>We may use subprocessors such as:</p>
      <ul>
        <li>Supabase — database, auth, storage, backend</li>
        <li>OpenAI or AI provider — AI responses</li>
        <li>Stripe — billing and payments</li>
        <li>Vercel or hosting provider — hosting/deployment</li>
        <li>Cloudflare — security, CDN, workers, realtime infrastructure</li>
        <li>MetaApi or MT5 connector provider — account connection/sync</li>
        <li>market-data providers — market/news/macro data</li>
        <li>analytics/error tools — diagnostics and product improvement</li>
      </ul>
      <p>
        A more detailed list is available on the{" "}
        <a href="/subprocessors" className="text-tos-warm hover:underline">
          Subprocessors
        </a>{" "}
        page.
      </p>

      <h2>8. International transfers</h2>
      <p>
        Some providers may process data outside the European Economic Area. Where required, we rely on appropriate
        safeguards such as Standard Contractual Clauses, adequacy decisions or other lawful transfer mechanisms.
      </p>

      <h2>9. Retention</h2>
      <p>We keep data only as long as needed for the purposes described above.</p>
      <p>
        <strong>Typical retention:</strong> account data while your account exists; billing records as required by
        tax/accounting law; journal/trade data until deleted by you or account deletion, unless retention is legally
        required; logs for a limited period unless needed for security/legal purposes; AI memory until deleted/reset by
        you where supported.
      </p>
      <p>Exact retention may depend on product settings and legal obligations.</p>

      <h2>10. Your rights</h2>
      <p>Depending on your location and applicable law, you may have rights to:</p>
      <ul>
        <li>access your personal data</li>
        <li>correct data</li>
        <li>delete data</li>
        <li>restrict processing</li>
        <li>object to processing</li>
        <li>data portability</li>
        <li>withdraw consent</li>
        <li>lodge a complaint with a supervisory authority</li>
      </ul>
      <p>
        For GDPR requests, contact:{" "}
        <a href={`mailto:${L.privacyEmail}`} className="text-tos-warm hover:underline">
          {L.privacyEmail}
        </a>
      </p>

      <h2>11. Security</h2>
      <p>
        We use reasonable technical and organisational measures to protect personal data, including authentication,
        RLS/access controls, server-side secrets, encryption in transit, role-based access and logging where
        appropriate.
      </p>
      <p>No system is 100% secure.</p>

      <h2>12. Cookies and tracking</h2>
      <p>
        We use necessary cookies/session storage for authentication and app functionality. Analytics or marketing cookies
        are described in our Cookie Policy.
      </p>

      <h2>13. Children</h2>
      <p>
        The services are not intended for children. Users must be old enough to enter into a binding agreement and use
        trading-related tools lawfully in their jurisdiction.
      </p>

      <h2>14. Changes</h2>
      <p>We may update this Privacy Policy. If changes are material, we will take reasonable steps to notify you.</p>

      <h2>15. Contact</h2>
      <p>
        Privacy questions:{" "}
        <a href={`mailto:${L.privacyEmail}`} className="text-tos-warm hover:underline">
          {L.privacyEmail}
        </a>
      </p>
    </>
  );
}
