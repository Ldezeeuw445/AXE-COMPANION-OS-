import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service · AXE Companion",
  description: "Terms of Service for AXE Companion and related Trading OS services.",
};

export default function TermsPage() {
  return (
    <>
      <h1>Terms of Service (draft)</h1>
      <p>
        These Terms govern your use of AXE Companion and related services operated by Trading OS (KvK 74239422). This
        is a working draft — review with counsel before relying on it in production.
      </p>
      <h2>Service</h2>
      <p>
        AXE Companion provides software tools for journaling, trade context, and AI-assisted conversation. It is not a
        broker, exchange, or investment adviser. Trading OS may offer additional terminal products under separate terms
        when available.
      </p>
      <h2>Accounts & eligibility</h2>
      <p>You must provide accurate registration information and keep credentials secure. You are responsible for activity under your account.</p>
      <h2>Acceptable use</h2>
      <ul>
        <li>No unlawful, harassing, or deceptive use of the service.</li>
        <li>No attempt to probe, disrupt, or bypass security or rate limits.</li>
        <li>No scraping or bulk extraction beyond normal personal use without permission.</li>
      </ul>
      <h2>Fees & changes</h2>
      <p>
        Free and paid tiers may apply. We may change pricing or features with reasonable notice where required by law.
      </p>
      <h2>Disclaimer of warranties</h2>
      <p>
        The service is provided &quot;as is&quot; without warranties of any kind, to the fullest extent permitted by law.
      </p>
      <h2>Limitation of liability</h2>
      <p>
        To the maximum extent permitted by applicable law, Trading OS is not liable for indirect, incidental, special,
        consequential, or punitive damages, or loss of profits, data, or goodwill.
      </p>
      <h2>Termination</h2>
      <p>We may suspend or terminate access for breach of these Terms or for operational or legal reasons.</p>
      <h2>Governing law</h2>
      <p>These Terms are governed by the laws of the Netherlands, without regard to conflict-of-law rules.</p>
      <h2>Contact</h2>
      <p>
        <a href="mailto:support@tradingosapp.com" className="text-tos-warm hover:underline">
          support@tradingosapp.com
        </a>
      </p>
    </>
  );
}
