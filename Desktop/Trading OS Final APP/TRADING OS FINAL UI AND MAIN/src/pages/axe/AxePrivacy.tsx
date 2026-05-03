import { AxeLegalShell } from '@/components/axe/AxeLegalShell';

export default function AxePrivacy() {
  return (
    <AxeLegalShell title="Privacy Policy">
      <p>
        This placeholder describes how AXE Companion may handle personal data in general terms. When you use AXE, certain
        information (such as account identifiers you create, trade metadata you ingest, and usage signals required to
        operate the product) may be processed by our service providers (for example, cloud hosting and authentication).
      </p>
      <p>
        You are responsible for ensuring your use of AXE complies with applicable laws and any obligations you have toward
        end users or counterparties. We do not provide legal advice.
      </p>
      <p>
        For questions about privacy practices, contact your product operator using the support channel you configure for
        your deployment.
      </p>
    </AxeLegalShell>
  );
}
