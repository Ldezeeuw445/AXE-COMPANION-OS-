"use client";

import { BrokerConnectWizard } from "@/components/accounts/BrokerConnectWizard";
import { ActiveSessionSeed } from "@/components/session/ActiveSessionSeed";

/**
 * Auth-free copy of the Accounts connect wizard so e2e can type a server
 * name without a session. Same component as /accounts — credentials still
 * stay on step 2, and nothing is posted until Connect.
 */
export function BrokerConnectProbeScreen() {
  return (
    <div data-testid="broker-connect-probe" className="flex min-h-0 flex-1 flex-col gap-4 pb-4">
      <ActiveSessionSeed lastTab="account" />
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/20">
          Connect MT5 account
        </p>
        <BrokerConnectWizard defaultRegion="london" />
      </div>
    </div>
  );
}
