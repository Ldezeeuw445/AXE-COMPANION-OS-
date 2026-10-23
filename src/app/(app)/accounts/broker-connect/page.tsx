import { BrokerConnectWizard } from "@/components/accounts/BrokerConnectWizard";
import { PageTitleInjector } from "@/components/shell/PageTitleInjector";
import { getDefaultRegionForRequest } from "@/lib/mt5/getDefaultRegionForRequest";

export default async function BrokerConnectPage() {
  const defaultRegion = await getDefaultRegionForRequest();
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 pb-4">
      <PageTitleInjector title="Connect broker" />
      <BrokerConnectWizard defaultRegion={defaultRegion} />
    </div>
  );
}
