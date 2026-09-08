import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/debug/cron-health
 *
 * Answers the one question that costs a round trip to guess: is CRON_SECRET
 * configured on this host at all? Every /api/cron/* route answers 401 both when
 * the secret is missing and when the caller's value is wrong, so from the
 * outside those two failures are indistinguishable — and they need opposite
 * fixes.
 *
 * Reports shape, never the value: whether it is set, its length, and a short
 * fingerprint. The fingerprint is enough to compare two sides ("does Vault hold
 * the same string as this host?") without either side revealing the secret.
 *
 * Mirrors /api/debug/chat-health, which already reports openai_key_set the same
 * way. No secret material is returned.
 */
function fingerprint(value: string): string {
  // Non-reversible short digest — comparable, not recoverable.
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < value.length; i += 1) {
    const c = value.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}

export async function GET() {
  const raw = process.env.CRON_SECRET;
  const secret = raw?.trim() ?? "";
  const configured = secret.length > 0;

  return NextResponse.json({
    cron_secret_configured: configured,
    cron_secret_length: configured ? secret.length : 0,
    cron_secret_fingerprint: configured ? fingerprint(secret) : null,
    // A value that only differs by surrounding whitespace is a common
    // copy-paste result and would still fail the routes' exact comparison.
    had_surrounding_whitespace: raw != null && raw !== secret,
    supabase_service_role_set: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
    metaapi_token_set: Boolean(
      (process.env.METAAPI_TOKEN ??
        process.env.AXE_METAAPI_TOKEN ??
        process.env.AXE_MT5_METAAPI_TOKEN ??
        process.env.METAAPI_KEY ??
        "").trim(),
    ),
    krater_api_key_set: Boolean(process.env.KRATER_API_KEY?.trim()),
    stripe_secret_set: Boolean(process.env.STRIPE_SECRET_KEY?.trim()),
    stripe_webhook_secret_set: Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim()),
    alpaca_configured: Boolean(
      (process.env.ALPACA_PAPER_API_KEY_ID ??
        process.env.ALPACA_PAPER_API_KEY ??
        process.env.ALPACA_API_KEY_ID ??
        process.env.ALPACA_API_KEY ??
        "").trim(),
    ),
    app_url: process.env.NEXT_PUBLIC_APP_URL ?? null,
  });
}
