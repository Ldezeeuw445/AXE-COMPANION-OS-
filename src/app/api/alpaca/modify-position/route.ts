import type { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAlpacaPaperConfig } from "@/lib/alpaca/env";
import { createAlpacaOrder, listAlpacaOrders, cancelAlpacaOrder } from "@/lib/alpaca/client";
import { toAlpacaSymbol } from "@/lib/alpaca/symbols";
import { alpacaQtyFromAxeVolume } from "@/lib/alpaca/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ModifyBody = {
  brokerAccountId: string;
  /** Alpaca asset_id or symbol — we resolve via open position. */
  positionId: string;
  stopLoss?: number | null;
  takeProfit?: number | null;
};

/**
 * Alpaca has no MT5-style position SL/TP fields. We attach exit orders:
 * stop → stop order, take profit → limit order on the opposite side.
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return Response.json({ ok: false, message: "Supabase not configured." }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ ok: false, message: "Unauthorized." }, { status: 401 });
  }

  const config = getAlpacaPaperConfig();
  if (!config) {
    return Response.json({ ok: false, message: "Alpaca not configured." }, { status: 503 });
  }

  let body: ModifyBody;
  try {
    body = (await request.json()) as ModifyBody;
  } catch {
    return Response.json({ ok: false, message: "Invalid JSON." }, { status: 400 });
  }

  const { data: account } = await supabase
    .from("user_broker_accounts")
    .select("id,connection_method")
    .eq("id", body.brokerAccountId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!account || account.connection_method !== "cloud_alpaca") {
    return Response.json({ ok: false, message: "Alpaca account not found." }, { status: 404 });
  }

  const { listAlpacaPositions } = await import("@/lib/alpaca/client");
  const positions = await listAlpacaPositions(config);
  const position = positions.find(
    (p) => p.asset_id === body.positionId || p.symbol === body.positionId,
  );
  if (!position) {
    return Response.json({ ok: false, message: "Position not found on Alpaca." }, { status: 404 });
  }

  const alpacaSymbol = toAlpacaSymbol(position.symbol);
  if (!alpacaSymbol) {
    return Response.json({ ok: false, message: "Symbol not supported on Alpaca." }, { status: 400 });
  }

  const qty = alpacaQtyFromAxeVolume(Math.abs(Number(position.qty) || 0));
  if (qty <= 0) {
    return Response.json({ ok: false, message: "Position has zero quantity." }, { status: 400 });
  }

  const exitSide = position.side === "short" ? "buy" : "sell";
  const prefix = `axe-exit-${user.id.slice(0, 8)}`;

  try {
    const openOrders = await listAlpacaOrders(config, { status: "open", symbols: alpacaSymbol, limit: 100 });
    const managed = openOrders.filter(
      (o) =>
        o.client_order_id?.startsWith(prefix) &&
        (o.order_type === "stop" || o.order_type === "limit") &&
        o.side === exitSide,
    );
    await Promise.all(managed.map((o) => cancelAlpacaOrder(config, o.id).catch(() => undefined)));

    const created: string[] = [];

    if (body.stopLoss != null && Number.isFinite(body.stopLoss) && body.stopLoss > 0) {
      const order = await createAlpacaOrder(config, {
        symbol: alpacaSymbol,
        qty,
        side: exitSide,
        type: "stop",
        time_in_force: "gtc",
        stop_price: body.stopLoss,
        client_order_id: `${prefix}-sl-${Date.now().toString(36)}`,
      });
      created.push(order.id);
    }

    if (body.takeProfit != null && Number.isFinite(body.takeProfit) && body.takeProfit > 0) {
      const order = await createAlpacaOrder(config, {
        symbol: alpacaSymbol,
        qty,
        side: exitSide,
        type: "limit",
        time_in_force: "gtc",
        limit_price: body.takeProfit,
        client_order_id: `${prefix}-tp-${Date.now().toString(36)}`,
      });
      created.push(order.id);
    }

    return Response.json({
      ok: true,
      message: created.length ? "Exit orders updated on Alpaca." : "Exit orders cleared.",
      orderIds: created,
    });
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "Alpaca modify failed." },
      { status: 422 },
    );
  }
}
