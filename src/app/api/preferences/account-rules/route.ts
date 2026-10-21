import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildAccountProfile, type AccountProfile } from "@/lib/risk/accountProfile";
import { parseAccountRules, withTradingRules } from "@/lib/trading/accountRules";

/**
 * GET/POST /api/preferences/account-rules
 *
 * The rules a trader states for one of their own accounts. `accountProfile`
 * has always promised these win over its guesses; until now nothing could
 * write them. See src/lib/trading/accountRules.ts.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLUMNS = "id,label,mt5_server,connection_method,metadata";

/**
 * What the guard would use right now, and where each number came from.
 *
 * The panel exists so a trader does not have to type their own firm's
 * rulebook into an app. For that it has to be able to show them what AXE
 * already worked out — the firm, the model, the limits, and which of those
 * are the firm's published numbers rather than a careful guess. Sending only
 * the numbers left the panel unable to tell the trader anything except
 * "here are some empty fields".
 */
function publicProfile(profile: AccountProfile) {
  return {
    kind: profile.kind,
    explicit: profile.explicit,
    description: profile.description,
    newsTradingAllowed: profile.newsTradingAllowed,
    weekendHoldingAllowed: profile.weekendHoldingAllowed,
    maxDailyLossPct: profile.maxDailyLossPct,
    maxDailyLossBasis: profile.maxDailyLossBasis,
    maxTotalLossPct: profile.maxTotalLossPct,
    maxTotalLossBasis: profile.maxTotalLossBasis,
    maxLot: profile.maxLot,
    provenance: profile.provenance,
    firm: profile.firm
      ? {
          name: profile.firm.name,
          model: profile.firm.model,
          /** Which models to offer as one-tap choices. */
          models: profile.firm.unresolvedModels,
          tightestAcrossModels: profile.firm.rulesAreTightestAcrossModels,
          /** Where the numbers were read, so the trader can check them too. */
          source: profile.firm.rules?.source ?? null,
          asOf: profile.firm.rules?.asOf ?? null,
        }
      : null,
  };
}

export async function GET() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ accounts: [] }, { status: 503 });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("user_broker_accounts")
    .select(COLUMNS)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const accounts = (data ?? []).map((row) => {
    const metadata = (row.metadata as Record<string, unknown> | null) ?? null;
    const profile = buildAccountProfile({
      label: (row.label as string | null) ?? null,
      mt5Server: (row.mt5_server as string | null) ?? null,
      metadata,
      connectionMethod: (row.connection_method as string | null) ?? null,
    });
    return {
      id: row.id as string,
      label: (row.label as string | null) ?? "Account",
      server: (row.mt5_server as string | null) ?? null,
      rules: parseAccountRules(metadata?.tradingRules),
      profile: publicProfile(profile),
    };
  });

  return NextResponse.json({ accounts }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { accountId?: unknown; rules?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const accountId = typeof body.accountId === "string" ? body.accountId.trim() : "";
  if (!accountId) return NextResponse.json({ error: "accountId is required." }, { status: 400 });

  // Scoped to this user's own accounts. RLS covers it too, but a 404 for
  // somebody else's id is a clearer answer than a silent no-op update.
  const { data: row } = await supabase
    .from("user_broker_accounts")
    .select(COLUMNS)
    .eq("user_id", user.id)
    .eq("id", accountId)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "No such account." }, { status: 404 });

  const rules = parseAccountRules(body.rules);
  const metadata = withTradingRules(row.metadata as Record<string, unknown> | null, rules);

  const { error } = await supabase
    .from("user_broker_accounts")
    .update({ metadata })
    .eq("user_id", user.id)
    .eq("id", accountId);
  if (error) {
    console.error("[account-rules] update failed:", error.message);
    return NextResponse.json({ error: "Could not save." }, { status: 500 });
  }

  const profile = buildAccountProfile({
    label: (row.label as string | null) ?? null,
    mt5Server: (row.mt5_server as string | null) ?? null,
    metadata,
    connectionMethod: (row.connection_method as string | null) ?? null,
  });

  return NextResponse.json({ ok: true, rules, profile: publicProfile(profile) });
}
