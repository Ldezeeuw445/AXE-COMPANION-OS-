import { AccountsScreen } from "@/components/accounts/AccountsScreen";
import { loadAccountsPageData } from "@/lib/broker/loadAccountsPageData";

export default async function AccountsPage() {
  const { accounts, activeAccountId, error } = await loadAccountsPageData();

  return (
    <AccountsScreen
      initialAccounts={accounts}
      initialActiveId={activeAccountId}
      loadError={error}
    />
  );
}
