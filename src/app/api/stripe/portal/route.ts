import "server-only";

import Stripe from "stripe";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getPublicAppBaseUrl, getStripeSecretKey } from "@/lib/env";
import { getUserAxeEntitlement } from "@/services/billingService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/stripe/portal
 * Opens Stripe Customer Portal for the signed-in subscriber.
 */
export async function POST() {
  const secret = getStripeSecretKey();
  if (!secret) {
    return Response.json({ ok: false, code: "stripe_not_configured" }, { status: 503 });
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return Response.json({ ok: false, code: "supabase_not_configured" }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ ok: false, code: "unauthorized" }, { status: 401 });
  }

  const entitlement = await getUserAxeEntitlement(supabase, user.id);
  if (!entitlement.stripeCustomerId) {
    return Response.json({ ok: false, code: "no_stripe_customer" }, { status: 404 });
  }

  const stripe = new Stripe(secret);
  const session = await stripe.billingPortal.sessions.create({
    customer: entitlement.stripeCustomerId,
    return_url: `${getPublicAppBaseUrl()}/upgrade`,
  });

  return Response.json({ ok: true, url: session.url });
}
