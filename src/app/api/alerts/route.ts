import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasEntitlementFeature } from "@/lib/billing/access";
import { getUserAxeEntitlement } from "@/services/billingService";
import { getMetadataSymbolMap, getMetadataSymbolReport, getMetadataSymbolUniverse } from "@/lib/broker/brokerSymbolRuntime";
import { cleanDisplaySymbol, resolveBrokerSymbol } from "@/lib/broker/symbolResolution";
import { DEMO_WATCHLIST_SYMBOLS, isDemoAccount } from "@/lib/broker/demoAccount";
import { isAlpacaSupportedSymbol, toAlpacaSymbol } from "@/lib/alpaca/symbols";

type CreateAlertBody = {
  symbol?: string | null;
  type?: string;
  condition?: string | null;
  threshold?: number | null;
  keyword?: string | null;
  status?: "active" | "paused";
  metadata?: Record<string, unknown>;
};

function isSmartAlertRequest(body: CreateAlertBody): boolean {
  const meta = body.metadata && typeof body.metadata === "object" ? body.metadata : {};
  if (meta.smartKind || meta.smartTitle) return true;
  if (meta.evaluator === "smart" || meta.evaluator === "position_risk") return true;
  return (body.type ?? "").trim() === "news" && Boolean(meta.evaluator);
}

export async function GET() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("user_alerts")
    .select("id,symbol,type,condition,threshold,keyword,status,triggered_at,created_at,metadata")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ alerts: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: CreateAlertBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const type = (body.type ?? "").trim();
  if (!type) return NextResponse.json({ error: "Missing type" }, { status: 400 });

  if (isSmartAlertRequest(body)) {
    const ent = await getUserAxeEntitlement(supabase, user.id);
    if (!hasEntitlementFeature(ent, "proactive_notifications", user.id)) {
      return NextResponse.json(
        { error: "Smart alerts require Pro — upgrade to enable AI-classified monitoring." },
        { status: 403 },
      );
    }
  }

  const symbol = (body.symbol ?? null) ? String(body.symbol).trim().toUpperCase() : null;
  const condition = body.condition ? String(body.condition).trim() : null;
  const keyword = body.keyword ? String(body.keyword).trim() : null;
  const threshold =
    body.threshold == null || body.threshold === ("" as unknown as number)
      ? null
      : Number.isFinite(Number(body.threshold))
        ? Number(body.threshold)
        : null;

  const status: "active" | "paused" = body.status === "paused" ? "paused" : "active";
  let metadata = body.metadata && typeof body.metadata === "object" ? body.metadata : {};

  const isSmart = isSmartAlertRequest(body);

  if (type === "price" && (!isSmart || symbol)) {
    if (!symbol) return NextResponse.json({ error: "Price alerts need a symbol." }, { status: 400 });
    const { data: prefs } = await supabase
      .from("user_workspace_preferences")
      .select("active_account_id")
      .eq("user_id", user.id)
      .maybeSingle();
    const activeId = (prefs?.active_account_id as string | null | undefined) ?? null;
    if (!activeId) {
      return NextResponse.json({ error: "Select an active broker account before creating price alerts." }, { status: 400 });
    }
    const { data: account } = await supabase
      .from("user_broker_accounts")
      .select("provider,connection_method,metadata")
      .eq("user_id", user.id)
      .eq("id", activeId)
      .maybeSingle();
    const accountMetadata = (account?.metadata ?? {}) as Record<string, unknown>;
    const displaySymbol = cleanDisplaySymbol(symbol) || symbol;
    const map = getMetadataSymbolMap(accountMetadata);
    const report = getMetadataSymbolReport(accountMetadata)[displaySymbol];
    const universe = getMetadataSymbolUniverse(accountMetadata);
    const brokerSymbol = map[displaySymbol] ?? resolveBrokerSymbol(displaySymbol, universe).brokerSymbol;
    const supported =
      Boolean(report?.resolved) ||
      (Boolean(map[displaySymbol]) && report?.resolved !== false) ||
      (universe.length > 0 && universe.includes(brokerSymbol)) ||
      (isDemoAccount(account) && DEMO_WATCHLIST_SYMBOLS.includes(displaySymbol as (typeof DEMO_WATCHLIST_SYMBOLS)[number])) ||
      (account?.connection_method === "cloud_alpaca" && isAlpacaSupportedSymbol(displaySymbol));
    if (!supported) {
      return NextResponse.json(
        { error: `${displaySymbol} is not available on the active broker account.`, reason: report?.reason ?? "broker_symbol_not_found" },
        { status: 400 },
      );
    }
    metadata = {
      ...metadata,
      broker_symbol: account?.connection_method === "cloud_alpaca" ? toAlpacaSymbol(displaySymbol) ?? displaySymbol : brokerSymbol,
      account_id: activeId,
    };
  }

  const { data, error } = await supabase
    .from("user_alerts")
    .insert({
      user_id: user.id,
      symbol,
      type,
      condition,
      threshold,
      keyword,
      status,
      metadata,
    })
    .select("id,symbol,type,condition,threshold,keyword,status,triggered_at,created_at,metadata")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ alert: data }, { status: 201 });
}
