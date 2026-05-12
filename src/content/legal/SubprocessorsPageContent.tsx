import { LEGAL } from "@/lib/legal/constants";

export function SubprocessorsPageContent() {
  const L = LEGAL;
  return (
    <>
      <h1>Subprocessors</h1>
      <p>
        <strong>Effective date:</strong> {L.effectiveDate}
      </p>
      <p>We use third-party providers to operate AXE Companion, Trading OS and related services.</p>
      <p>This list may change over time.</p>

      <div className="mt-4 overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Provider</th>
              <th>Purpose</th>
              <th>Data categories</th>
              <th>Region / notes</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Supabase</td>
              <td>Auth, database, storage, backend functions</td>
              <td>account data, app data, journal, trades, memory</td>
              <td>EU (multi-region)</td>
            </tr>
            <tr>
              <td>OpenAI / AI provider</td>
              <td>AI responses and analysis</td>
              <td>prompts, context, messages, selected user data needed for responses</td>
              <td>US (global)</td>
            </tr>
            <tr>
              <td>Stripe</td>
              <td>Payments and subscriptions</td>
              <td>billing data, payment metadata, customer ID</td>
              <td>IE / US (global)</td>
            </tr>
            <tr>
              <td>Vercel</td>
              <td>Hosting frontend/backend</td>
              <td>logs, request data, deployment data</td>
              <td>Global (edge / region-pinned)</td>
            </tr>
            <tr>
              <td>Cloudflare</td>
              <td>CDN, security, workers, realtime</td>
              <td>IP, request logs, websocket data</td>
              <td>Global (edge)</td>
            </tr>
            <tr>
              <td>MetaApi / MT5 connector</td>
              <td>Broker/MT5 account sync</td>
              <td>broker metadata, trade history, account snapshots</td>
              <td>London / New York / Singapore (per account)</td>
            </tr>
            <tr>
              <td>Market data providers</td>
              <td>Market/news/macro data</td>
              <td>symbols, queries, usage logs</td>
              <td>US / EU (per provider)</td>
            </tr>
            <tr>
              <td>Analytics / error monitoring</td>
              <td>Diagnostics and product improvement</td>
              <td>device/log/usage data</td>
              <td>EU / US</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-sm text-tos-dim">
        Data residency varies per provider plan. For binding region commitments and the most current
        sub-processor list, see each provider&apos;s Data Processing Addendum.
      </p>
      <p className="mt-4">Users will be informed of material changes where required.</p>
      <p>
        Contact:{" "}
        <a href={`mailto:${L.privacyEmail}`} className="text-tos-warm hover:underline">
          {L.privacyEmail}
        </a>
      </p>
    </>
  );
}
