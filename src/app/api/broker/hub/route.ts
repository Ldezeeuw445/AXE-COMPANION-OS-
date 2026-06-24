import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAxeBrokerConnectionHubForSession } from "@/lib/broker/hub/createHub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type HubPostBody =
  | {
      action?: "doctor";
      accountId: string;
    }
  | {
      action: "disconnect";
      accountId: string;
    }
  | {
      action?: "sync";
      accountId: string;
      providerStatus?: string | null;
      hubStatus?: string | null;
      metadata?: Record<string, unknown> | null;
    };

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

  const { data: row, error } = await supabase
    .from("user_broker_accounts")
    .select("id,user_id,metadata")
    .eq("id", accountId)
    .eq("user_id", sessionHub.userId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ ok: false, message: "Account not found." }, { status: 404 });
  }

  const { error: updateError } = await supabase
    .from("user_broker_accounts")
    .update({
      provider_status:
        typeof body.providerStatus === "string" && body.providerStatus.trim()
          ? body.providerStatus.trim()
          : undefined,
      hub_status:
        typeof body.hubStatus === "string" && body.hubStatus.trim()
          ? body.hubStatus.trim()
          : undefined,
      metadata:
        body.metadata && typeof body.metadata === "object"
          ? {
              ...((row.metadata as Record<string, unknown> | null) ?? {}),
              ...body.metadata,
            }
          : row.metadata,
      last_sync_at: new Date().toISOString(),
    })
    .eq("id", accountId)
    .eq("user_id", sessionHub.userId);

  if (updateError) {
    return NextResponse.json({ ok: false, message: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
