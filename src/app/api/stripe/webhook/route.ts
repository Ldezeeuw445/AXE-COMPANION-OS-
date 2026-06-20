import "server-only";

import type { NextRequest } from "next/server";
import Stripe from "stripe";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/serviceRole";
import { getStripeSecretKey, getStripeWebhookSecret } from "@/lib/env";
import type { AxePlanId } from "@/lib/billing/tiers";
import { FOUNDER_SEAT_CAP } from "@/lib/billing/tiers";
import {
  resolvePlanFromCheckoutMetadata,
  resolvePlanFromStripePriceId,
} from "@/lib/billing/stripePlans";
import { getFounderSeatsUsed } from "@/services/billingService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
        await handleSubscriptionChange(stripe, supabase, sub);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(supabase, sub);
        break;
      }
      default:
        break;
    }
    return Response.json({ received: true, type: event.type });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[stripe webhook] handler failed", { type: event.type, message });
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
  let plan: AxePlanId = resolvePlanFromCheckoutMetadata(session.metadata) ?? "pro";

  if (subscriptionId) {
    const sub = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ["items.data.price"],
    });
    proUntil = subscriptionPeriodEndIso(sub);
    plan = resolvePlanFromSubscription(sub) ?? plan;
  } else if (session.mode === "payment") {
    proUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  }

  plan = await validatePlanAvailability(supabase, plan, userId);

  await upsertEntitlement(supabase, {
    userId,
    plan,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    proUntil,
    grantFounderBadge: plan === "founder",
  });
}

async function handleSubscriptionChange(
  stripe: Stripe,
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

  let plan: AxePlanId = stillActive
    ? (resolvePlanFromSubscription(sub) ?? "pro")
    : "free";

  if (stillActive) {
    plan = await validatePlanAvailability(supabase, plan, userId);
  }

  const { data: existing } = await supabase
    .from("axe_user_entitlements")
    .select("founder_badge")
    .eq("user_id", userId)
    .maybeSingle();

  await upsertEntitlement(supabase, {
    userId,
    plan,
    stripeCustomerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    stripeSubscriptionId: sub.id,
    proUntil,
    grantFounderBadge:
      plan === "founder" || existing?.founder_badge === true,
  });
}

async function handleSubscriptionDeleted(
  supabase: SupabaseClientLike,
  sub: Stripe.Subscription,
): Promise<void> {
  const userId = await resolveUserIdFromSubscription(supabase, sub);
  if (!userId) return;

  const { data: existing } = await supabase
    .from("axe_user_entitlements")
    .select("founder_badge")
    .eq("user_id", userId)
    .maybeSingle();

  await upsertEntitlement(supabase, {
    userId,
    plan: "free",
    stripeCustomerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    stripeSubscriptionId: null,
    proUntil: null,
    grantFounderBadge: existing?.founder_badge === true,
  });
}

async function validatePlanAvailability(
  supabase: SupabaseClientLike,
  plan: AxePlanId,
  existingUserId?: string,
): Promise<AxePlanId> {
  if (existingUserId) {
    const { data: existing } = await supabase
      .from("axe_user_entitlements")
      .select("founder_badge, chat_quota_exempt")
      .eq("user_id", existingUserId)
      .maybeSingle();
    if (existing?.founder_badge === true && plan === "founder") {
      return "founder";
    }
  }

  if (plan === "founder") {
    const used = await getFounderSeatsUsed(supabase);
    if (used >= FOUNDER_SEAT_CAP) {
      console.warn("[stripe webhook] founder sold out — falling back to elite", { used });
      return "elite";
    }
    return "founder";
  }
  if (plan === "elite") {
    const used = await getFounderSeatsUsed(supabase);
    if (used < FOUNDER_SEAT_CAP) {
      console.warn("[stripe webhook] elite not open yet — keeping pro", { used, existingUserId });
      return "pro";
    }
    return "elite";
  }
  return plan;
}

function resolvePlanFromSubscription(sub: Stripe.Subscription): AxePlanId | null {
  const metaPlan = resolvePlanFromCheckoutMetadata(
    (sub.metadata ?? {}) as Record<string, string>,
  );
  if (metaPlan) return metaPlan;

  const priceId = sub.items?.data?.[0]?.price?.id ?? null;
  return resolvePlanFromStripePriceId(priceId);
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
  const epoch =
    (sub as unknown as { current_period_end?: number }).current_period_end ??
    sub.items?.data?.[0]?.current_period_end ??
    null;
  if (!epoch) return null;
  return new Date(epoch * 1000).toISOString();
}

type EntitlementUpsert = {
  userId: string;
  plan: AxePlanId;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  proUntil: string | null;
  grantFounderBadge: boolean;
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
        founder_badge: input.grantFounderBadge,
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
