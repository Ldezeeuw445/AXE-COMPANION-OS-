import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy · AXE Companion",
};

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy Policy (draft)</h1>
      <p>
        This policy describes how Trading OS (KvK 74239422) processes personal data in connection with AXE Companion.
        Draft for review — align with your DPA, subprocessors, and analytics before launch.
      </p>
      <h2>Data we process</h2>
      <ul>
        <li>Account identifiers (e.g. email), authentication events, and profile fields you provide.</li>
        <li>Usage and technical logs needed to operate and secure the service.</li>
        <li>Content you submit (chat messages, journal entries, labels) stored in our database under your account.</li>
        <li>Broker or trade data you connect via approved integrations (e.g. MT5 ingest).</li>
      </ul>
      <h2>Purposes</h2>
      <p>Providing the product, billing where applicable, security, abuse prevention, support, and legal compliance.</p>
      <h2>Processors</h2>
      <p>
        We use infrastructure and AI providers as described in the{" "}
        <a href="/legal/subprocessors" className="text-tos-warm hover:underline">
          Subprocessors
        </a>{" "}
        page. We do not sell your personal data.
      </p>
      <h2>Retention</h2>
      <p>We retain data as long as your account is active and as required by law or legitimate business needs thereafter.</p>
      <h2>Your rights (EEA/UK)</h2>
      <p>
        Depending on jurisdiction you may have rights to access, rectify, erase, restrict, or object to processing, and
        to lodge a complaint with a supervisory authority. Contact us to exercise these rights.
      </p>
      <h2>International transfers</h2>
      <p>Where data is processed outside your country, we use appropriate safeguards such as standard contractual clauses.</p>
      <h2>Contact</h2>
      <p>
        <a href="mailto:support@tradingosapp.com" className="text-tos-warm hover:underline">
          support@tradingosapp.com
        </a>
      </p>
    </>
  );
}
