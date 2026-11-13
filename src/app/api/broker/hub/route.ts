import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAxeBrokerConnectionHubForSession } from "@/lib/broker/hub/createHub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The hub panel can disconnect an account or run its connection doctor. Both
 * go through the hub service, which writes only fixed, server-decided values.
 *
 * There used to be a third action, `sync`, that copied `providerStatus`,
 * `hubStatus` and `metadata` from the request body onto the account row.
 * Nothing in the app called it, and it let a trader mark their own account
 * connected or rewrite the MetaApi summary in `metadata` that the ledger is
 * reconciled against (TOS-SEC-2). Provider state is written by the sync paths
 * (`mt5Cloud.ts`, `hub/sync.ts`), never taken from the request.
 */
interface HubPostBody {
  action?: "doctor" | "disconnect";
  accountId: string;
}

export async function GET() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, message: "Supabase unavailable." }, { status: 503 });
  }

  const sessionHub = await createAxeBrokerConnectionHubForSession(supabase);
  if (!sessionHub) {
    return NextResponse.json({ ok: false, message: "Not authenticated." }, { status: 401 });
  }

  const [accounts, catalog] = await Promise.all([
    sessionHub.hub.listAccounts(),
    sessionHub.hub.listBrokerCatalog(),
  ]);

  return NextResponse.json({ ok: true, accounts, catalog });
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, message: "Supabase unavailable." }, { status: 503 });
  }

  const sessionHub = await createAxeBrokerConnectionHubForSession(supabase);
  if (!sessionHub) {
    return NextResponse.json({ ok: false, message: "Not authenticated." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Partial<HubPostBody>;
  const accountId = typeof body.accountId === "string" ? body.accountId.trim() : "";
  if (!accountId) {
    return NextResponse.json({ ok: false, message: "accountId is required." }, { status: 400 });
  }

  if (body.action === "disconnect") {
    await sessionHub.hub.disconnectAccount(accountId);
    return NextResponse.json({ ok: true });
  }

  if (!body.action || body.action === "doctor") {
    const result = await sessionHub.hub.runConnectionDoctor(accountId);
    return NextResponse.json({ ok: true, result });
  }

  return NextResponse.json({ ok: false, message: "Unknown action." }, { status: 400 });
}
