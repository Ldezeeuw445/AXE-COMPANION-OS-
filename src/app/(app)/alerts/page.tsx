import { AlertsClient } from "@/app/(app)/alerts/AlertsClient";
import { getTradeExecutionPrefsServerState } from "@/lib/trading/serverTradePrefs";
import { hasEntitlementFeature } from "@/lib/billing/access";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getUserAxeEntitlement } from "@/services/billingService";

type PageProps = {
  searchParams: Promise<{ symbol?: string }>;
};

export default async function AlertsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const symbol = (sp.symbol ?? "").trim().toUpperCase();
  const tradePrefs = await getTradeExecutionPrefsServerState();

  const supabase = await createServerSupabaseClient();
  let canSmartAlerts = false;
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const ent = await getUserAxeEntitlement(supabase, user.id);
      canSmartAlerts = hasEntitlementFeature(ent, "proactive_notifications", user.id);
    }
  }

  return (
    <AlertsClient
      initialSymbol={symbol}
      tradePrefs={tradePrefs}
      canSmartAlerts={canSmartAlerts}
    />
  );
}
