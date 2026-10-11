import { NextResponse } from "next/server";

/**
 * Krater was removed on 2026-10-11 — its key was never set on this host and
 * the local generator was already writing both broadcasts. Nothing pushes to
 * this endpoint any more.
 *
 * Kept as an explicit 410 rather than deleted: a webhook URL that was ever
 * handed to a third party should say it is gone, not 404 as if it had never
 * existed. Daily News and Market Recap now come from
 * services/broadcastSyncService.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    { ok: false, error: "The Krater feed integration was removed. AXE writes these broadcasts itself." },
    { status: 410 },
  );
}

export async function GET() {
  return NextResponse.json({ ok: false, error: "gone" }, { status: 410 });
}
