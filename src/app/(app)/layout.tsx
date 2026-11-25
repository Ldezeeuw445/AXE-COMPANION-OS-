import { Suspense } from "react";
import { MobileShell } from "@/components/shell/MobileShell";
import { EmbedDemoFlags } from "@/components/shell/EmbedDemoFlags";
import { readActiveSessionCookie, readShellViewportCookie } from "@/lib/session/readActiveSession.server";
import { FreePhoneGate } from "@/components/billing/FreePhoneGate";
import { featurePlanForEntitlement } from "@/lib/billing/access";
import type { AxePlanId } from "@/lib/billing/tiers";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getUserAxeEntitlement } from "@/services/billingService";

/** The signed-in user's feature plan, or null when signed out / unknown (the auth gate handles that). */
async function currentFeaturePlan(): Promise<AxePlanId | "exempt" | null> {
  try {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return null;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const ent = await getUserAxeEntitlement(supabase, user.id);
    return featurePlanForEntitlement(ent, user.id);
  } catch {
    // Never lock someone out because the plan could not be read.
    return null;
  }
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [initialSession, initialViewport, featurePlan] = await Promise.all([
    readActiveSessionCookie(),
    readShellViewportCookie(),
    currentFeaturePlan(),
  ]);

  return (
    <>
      <Suspense fallback={null}>
        <EmbedDemoFlags />
      </Suspense>
      <MobileShell initialSession={initialSession} initialViewport={initialViewport}>
        <FreePhoneGate featurePlan={featurePlan}>{children}</FreePhoneGate>
      </MobileShell>
    </>
  );
}
