/**
 * One-shot Stripe catalog for AXE Companion billing tiers.
 *
 * Creates (or reuses) Products + recurring EUR prices + Payment Links for:
 *   Pro €20/mo · Founder €40/mo · Elite €50/mo
 *
 * Optionally registers the production webhook endpoint and prints env vars
 * for Vercel / .env.local.
 *
 * Requires:
 *   STRIPE_SECRET_KEY=sk_live_... or sk_test_...
 *
 * Optional:
 *   NEXT_PUBLIC_APP_URL=https://your-domain.com  (success redirect + webhook URL)
 *   STRIPE_SETUP_CREATE_WEBHOOK=true             (register webhook endpoint)
 *
 * Run:
 *   node scripts/setup-stripe-billing.mjs
 */
import Stripe from "stripe";

const TIERS = [
  {
    id: "pro",
    label: "AXE Companion Pro",
    description: "Full AXE Companion — unlimited chat and complete workflow stack.",
    amountEur: 2000,
    priceEnv: "STRIPE_PRICE_PRO",
    linkEnv: "NEXT_PUBLIC_STRIPE_PAYMENT_LINK_PRO",
    legacyLinkEnv: "NEXT_PUBLIC_STRIPE_PAYMENT_LINK",
  },
  {
    id: "founder",
    label: "AXE Companion Founder",
    description: "Everything in Pro plus permanent Founder status (limited to 100).",
    amountEur: 4000,
    priceEnv: "STRIPE_PRICE_FOUNDER",
    linkEnv: "NEXT_PUBLIC_STRIPE_PAYMENT_LINK_FOUNDER",
  },
  {
    id: "elite",
    label: "AXE Companion Elite",
    description: "Everything in Pro with premium support and early access.",
    amountEur: 5000,
    priceEnv: "STRIPE_PRICE_ELITE",
    linkEnv: "NEXT_PUBLIC_STRIPE_PAYMENT_LINK_ELITE",
  },
];

const WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
];

function appBaseUrl() {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (raw) return raw.replace(/\/$/, "");
  return "https://www.axecompanion.com";
}

async function findProductByAxePlan(stripe, axePlan) {
  const listed = await stripe.products.list({ limit: 100, active: true });
  return listed.data.find((p) => p.metadata?.axe_plan === axePlan) ?? null;
}

async function findPriceForProduct(stripe, productId, amountEur) {
  const prices = await stripe.prices.list({ product: productId, active: true, limit: 100 });
  return (
    prices.data.find(
      (p) =>
        p.type === "recurring" &&
        p.currency === "eur" &&
        p.unit_amount === amountEur &&
        p.recurring?.interval === "month",
    ) ?? null
  );
}

async function findPaymentLinkForPrice(stripe, priceId) {
  const links = await stripe.paymentLinks.list({ limit: 100, active: true });
  for (const link of links.data) {
    const full = await stripe.paymentLinks.retrieve(link.id, { expand: ["line_items"] });
    const lineItems = full.line_items?.data ?? [];
    const matches = lineItems.some((item) => {
      const price = item.price;
      const priceIdFromItem = typeof price === "string" ? price : price?.id;
      return priceIdFromItem === priceId;
    });
    if (matches) return full;
  }
  return null;
}

async function ensureTier(stripe, tier, successUrl) {
  let product = await findProductByAxePlan(stripe, tier.id);
  if (!product) {
    product = await stripe.products.create({
      name: tier.label,
      description: tier.description,
      metadata: { axe_plan: tier.id, product: "axe_companion" },
    });
    console.log(`  + product ${tier.id}: ${product.id}`);
  } else {
    console.log(`  ✓ product ${tier.id}: ${product.id}`);
  }

  let price = await findPriceForProduct(stripe, product.id, tier.amountEur);
  if (!price) {
    price = await stripe.prices.create({
      product: product.id,
      currency: "eur",
      unit_amount: tier.amountEur,
      recurring: { interval: "month" },
      metadata: { axe_plan: tier.id },
    });
    console.log(`  + price ${tier.id}: ${price.id} (€${tier.amountEur / 100}/mo)`);
  } else {
    console.log(`  ✓ price ${tier.id}: ${price.id}`);
  }

  let paymentLink = await findPaymentLinkForPrice(stripe, price.id);
  if (!paymentLink) {
    paymentLink = await stripe.paymentLinks.create({
      line_items: [{ price: price.id, quantity: 1 }],
      metadata: { axe_plan: tier.id },
      subscription_data: { metadata: { axe_plan: tier.id } },
      after_completion: {
        type: "redirect",
        redirect: { url: successUrl },
      },
      allow_promotion_codes: true,
    });
    console.log(`  + payment link ${tier.id}: ${paymentLink.url}`);
  } else {
    console.log(`  ✓ payment link ${tier.id}: ${paymentLink.url}`);
  }

  return {
    priceId: price.id,
    paymentLinkUrl: paymentLink.url,
    priceEnv: tier.priceEnv,
    linkEnv: tier.linkEnv,
    legacyLinkEnv: tier.legacyLinkEnv,
  };
}

async function ensureWebhook(stripe, webhookUrl) {
  const existing = await stripe.webhookEndpoints.list({ limit: 100 });
  const match = existing.data.find((e) => e.url === webhookUrl);
  if (match) {
    console.log(`\n✓ Webhook already registered: ${match.id}`);
    console.log("  (Stripe does not re-show signing secrets for existing endpoints.)");
    console.log("  Use Dashboard → Developers → Webhooks if you need a new secret.");
    return null;
  }

  const endpoint = await stripe.webhookEndpoints.create({
    url: webhookUrl,
    enabled_events: WEBHOOK_EVENTS,
    description: "AXE Companion billing (checkout + subscriptions)",
  });
  console.log(`\n+ Webhook registered: ${endpoint.id}`);
  return endpoint.secret;
}

async function ensureBillingPortal(stripe) {
  const configs = await stripe.billingPortal.configurations.list({ limit: 1 });
  if (configs.data.length > 0) {
    console.log(`\n✓ Billing portal configured: ${configs.data[0].id}`);
    return;
  }
  const config = await stripe.billingPortal.configurations.create({
    business_profile: {
      headline: "AXE Companion",
    },
    features: {
      customer_update: { enabled: true, allowed_updates: ["email", "address"] },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: { enabled: true, mode: "at_period_end" },
      subscription_update: { enabled: false },
    },
  });
  console.log(`\n+ Billing portal configured: ${config.id}`);
}

async function main() {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) {
    console.error("Missing STRIPE_SECRET_KEY. Export your Stripe secret key first.");
    process.exit(1);
  }

  const base = appBaseUrl();
  const successUrl = `${base}/upgrade/success?session_id={CHECKOUT_SESSION_ID}`;
  const webhookUrl = `${base}/api/stripe/webhook`;
  const mode = secretKey.startsWith("sk_live") ? "live" : "test";

  console.log(`AXE Companion Stripe setup (${mode})`);
  console.log(`App URL: ${base}`);
  console.log(`Success redirect: ${successUrl}`);
  console.log(`Webhook URL: ${webhookUrl}\n`);

  const stripe = new Stripe(secretKey);

  await ensureBillingPortal(stripe);

  const envLines = [];
  for (const tier of TIERS) {
    console.log(`\n${tier.label}`);
    const result = await ensureTier(stripe, tier, successUrl);
    envLines.push(`${result.priceEnv}=${result.priceId}`);
    envLines.push(`${result.linkEnv}=${result.paymentLinkUrl}`);
    if (result.legacyLinkEnv && tier.id === "pro") {
      envLines.push(`${result.legacyLinkEnv}=${result.paymentLinkUrl}`);
    }
  }

  let webhookSecret = null;
  if (process.env.STRIPE_SETUP_CREATE_WEBHOOK === "true") {
    webhookSecret = await ensureWebhook(stripe, webhookUrl);
  } else {
    console.log("\n(Webhook not created — set STRIPE_SETUP_CREATE_WEBHOOK=true to register automatically.)");
  }

  console.log("\n--- Copy into Vercel → Settings → Environment Variables ---\n");
  console.log("# Stripe secret (you already have this)");
  console.log("# STRIPE_SECRET_KEY=sk_...");
  console.log("");
  for (const line of envLines) console.log(line);
  console.log("");
  if (webhookSecret) {
    console.log(`STRIPE_WEBHOOK_SECRET=${webhookSecret}`);
  } else {
    console.log("# STRIPE_WEBHOOK_SECRET=whsec_...  (from Stripe Dashboard webhook endpoint)");
  }
  console.log(`NEXT_PUBLIC_APP_URL=${base}`);
  console.log("");
  console.log("Redeploy after saving env vars. Test with a Stripe test card on /upgrade.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
