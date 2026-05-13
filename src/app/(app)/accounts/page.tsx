import { AccountsScreen } from "@/components/accounts/AccountsScreen";
import { loadAccountsPageData } from "@/lib/broker/loadAccountsPageData";
import { getDefaultRegionForRequest } from "@/lib/mt5/getDefaultRegionForRequest";

export default async function AccountsPage() {
  const [{ accounts, activeAccountId, error }, defaultRegion] = await Promise.all([
    loadAccountsPageData(),
    getDefaultRegionForRequest(),
  ]);

  return (
    <AccountsScreen
      initialAccounts={accounts}
      initialActiveId={activeAccountId}
      loadError={error}
      defaultMetaApiRegion={defaultRegion}
    />
  );
}
