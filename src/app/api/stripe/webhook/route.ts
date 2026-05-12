import "server-only";

import type { NextRequest } from "next/server";
import Stripe from "stripe";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/serviceRole";
import { getStripeSecretKey, getStripeWebhookSecret } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe webhook → axe_user_entitlements sync.
 *
 * Flow:
 *   1. User clicks "Upgrade to Pro" → opens Stripe Payment Link with
 *      `client_reference_id=<auth.users.id>` in the URL.
 *   2. User pays at Stripe-hosted checkout. Stripe sends
 *      `checkout.session.completed` to this endpoint.
 *   3. We resolve user_id from `session.client_reference_id`, link the
 *      Stripe customer + subscription, set plan='pro', set pro_until from
 *      the subscription's current_period_end. UPSERT keyed on user_id.
 *   4. Renewals → `customer.subscription.updated` refreshes pro_until.
 *      Cancellations → `customer.subscription.deleted` drops to 'free'.
 *
 * Idempotent: every handler is an UPSERT keyed on user_id. Stripe may
 * retry the same event multiple times — repeating the upsert is a no-op.
 *
 * Setup checklist (one-time, Stripe Dashboard):
 *   - Create or reuse a Payment Link for the €19 Pro plan
 *     (Products → AXE Pro → Payment Link).
 *   - Copy that link into NEXT_PUBLIC_STRIPE_PAYMENT_LINK.
 *   - Developers → Webhooks → Add endpoint
 *     URL: https://<your-domain>/api/stripe/webhook
 *     Events: checkout.session.completed,
 *             customer.subscription.updated,
 *             customer.subscription.deleted
 *   - Copy the signing secret → STRIPE_WEBHOOK_SECRET.
 *   - Set STRIPE_SECRET_KEY and SUPABASE_SERVICE_ROLE_KEY on the deployment.
 */

export async function POST(request: NextRequest) {
  const secret = getStripeSecretKey();
  const webhookSecret = getStripeWebhookSecret();
  if (!secret || !webhookSecret) {
    return jsonError(503, "stripe_not_configured");
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return jsonError(400, "missing_signature");
  }

  const rawBody = await request.text();
  const stripe = new Stripe(secret);

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return jsonError(400, "invalid_signature", message);
  }

  const supabase = createServiceRoleSupabaseClient();
  if (!supabase) {
    return jsonError(503, "supabase_service_role_missing");
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(stripe, supabase, session);
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.created": {
        const sub = event.data.object as Stripe.Subscription;
        await handleSubscriptionChange(supabase, sub);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(supabase, sub);
        break;
      }
      default:
        // Unhandled event types are intentionally a no-op. Stripe needs a 2xx
        // to stop retrying; we only act on the lifecycle events we care about.
        break;
    }
    return Response.json({ received: true, type: event.type });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[stripe webhook] handler failed", { type: event.type, message });
    // 5xx → Stripe will retry with backoff. That's correct for transient
    // failures (DB blip). For permanent failures we still want visibility in
    // logs rather than silently dropping events.
    return jsonError(500, "handler_failed", message);
  }
}

type SupabaseClientLike = NonNullable<ReturnType<typeof createServiceRoleSupabaseClient>>;

async function handleCheckoutCompleted(
  stripe: Stripe,
  supabase: SupabaseClientLike,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const userId = session.client_reference_id;
  if (!userId) {
    // No user attached — can't link entitlement. Log and bail; admin must
    // reconcile manually (e.g. promo via Stripe Dashboard without app flow).
    console.warn("[stripe webhook] checkout.session.completed without client_reference_id", {
      sessionId: session.id,
      customer: session.customer,
    });
    return;
  }

  const customerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id ?? null;

  let proUntil: string | null = null;
  if (subscriptionId) {
    // Pull the subscription once so we have current_period_end accurate.
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    proUntil = subscriptionPeriodEndIso(sub);
  } else if (session.mode === "payment") {
    // One-time payment Payment Links: no subscription, fall back to 30d
    // grace from the checkout time. The user can re-upgrade after expiry.
    proUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  }

  await upsertEntitlement(supabase, {
    userId,
    plan: "pro",
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    proUntil,
  });
}

async function handleSubscriptionChange(
  supabase: SupabaseClientLike,
  sub: Stripe.Subscription,
): Promise<void> {
  const userId = await resolveUserIdFromSubscription(supabase, sub);
  if (!userId) {
    console.warn("[stripe webhook] subscription event without resolvable user", {
      subscriptionId: sub.id,
      customer: sub.customer,
    });
    return;
  }

  const proUntil = subscriptionPeriodEndIso(sub);
  const stillActive =
    sub.status === "active" || sub.status === "trialing" || sub.status === "past_due";

  await upsertEntitlement(supabase, {
    userId,
    plan: stillActive ? "pro" : "free",
    stripeCustomerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    stripeSubscriptionId: sub.id,
    proUntil,
  });
}

async function handleSubscriptionDeleted(
  supabase: SupabaseClientLike,
  sub: Stripe.Subscription,
): Promise<void> {
  const userId = await resolveUserIdFromSubscription(supabase, sub);
  if (!userId) return;

  // Keep stripe_customer_id (user may resubscribe with same Stripe customer).
  // Clear subscription id + pro_until — user is back on the free tier.
  await upsertEntitlement(supabase, {
    userId,
    plan: "free",
    stripeCustomerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    stripeSubscriptionId: null,
    proUntil: null,
  });
}

async function resolveUserIdFromSubscription(
  supabase: SupabaseClientLike,
  sub: Stripe.Subscription,
): Promise<string | null> {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  if (!customerId) return null;

  const { data } = await supabase
    .from("axe_user_entitlements")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  return (data?.user_id as string | undefined) ?? null;
}

function subscriptionPeriodEndIso(sub: Stripe.Subscription): string | null {
  // `current_period_end` is on the subscription item in newer Stripe API
  // versions — fall back to the first item's period_end when the top-level
  // field is absent.
  const epoch =
    (sub as unknown as { current_period_end?: number }).current_period_end ??
    sub.items?.data?.[0]?.current_period_end ??
    null;
  if (!epoch) return null;
  return new Date(epoch * 1000).toISOString();
}

type EntitlementUpsert = {
  userId: string;
  plan: "free" | "pro";
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  proUntil: string | null;
};

async function upsertEntitlement(
  supabase: SupabaseClientLike,
  input: EntitlementUpsert,
): Promise<void> {
  const { error } = await supabase
    .from("axe_user_entitlements")
    .upsert(
      {
        user_id: input.userId,
        plan: input.plan,
        stripe_customer_id: input.stripeCustomerId,
        stripe_subscription_id: input.stripeSubscriptionId,
        pro_until: input.proUntil,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

  if (error) {
    throw new Error(`axe_user_entitlements upsert failed: ${error.message}`);
  }
}

function jsonError(status: number, code: string, message?: string) {
  return Response.json({ ok: false, code, ...(message ? { message } : {}) }, { status });
}
