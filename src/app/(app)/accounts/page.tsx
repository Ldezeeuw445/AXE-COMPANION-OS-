import { AccountsScreen } from "@/components/accounts/AccountsScreen";
import { loadAccountsPageData } from "@/lib/broker/loadAccountsPageData";
import { getDefaultRegionForRequest } from "@/lib/mt5/getDefaultRegionForRequest";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getUserAxeEntitlement } from "@/services/billingService";
import { featurePlanForEntitlement } from "@/lib/billing/access";
import {
  canConnectLiveAccount,
  liveAccountsIncludedNotice,
} from "@/lib/billing/liveAccounts";

export default async function AccountsPage() {
  const [{ accounts, activeAccountId, ledgers, error }, defaultRegion] = await Promise.all([
    loadAccountsPageData(),
    getDefaultRegionForRequest(),
  ]);

  let liveAccountsNotice: string | undefined;
  let liveCapBlocked = false;
  let liveCapMessage: string | undefined;

  const supabase = await createServerSupabaseClient();
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const ent = await getUserAxeEntitlement(supabase, user.id);
      const plan = featurePlanForEntitlement(ent, user.id);
      const planId = plan === "exempt" ? "founder" : plan;
      liveAccountsNotice = liveAccountsIncludedNotice(planId);
      const gate = canConnectLiveAccount({
        plan: planId,
        existingAccounts: accounts.map((a) => ({
          id: a.id,
          connection_method: a.connection_method,
          provider: a.provider,
          status: a.status,
        })),
      });
      if (!gate.allowed) {
        liveCapBlocked = true;
        liveCapMessage = gate.message;
      }
    }
  }

  return (
    <AccountsScreen
      initialAccounts={accounts}
      initialActiveId={activeAccountId}
      ledgers={ledgers}
      loadError={error}
      defaultMetaApiRegion={defaultRegion}
      liveAccountsNotice={liveAccountsNotice}
      liveCapBlocked={liveCapBlocked}
      liveCapMessage={liveCapMessage}
    />
  );
}
