import type { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAlpacaPaperConfig } from "@/lib/alpaca/env";
import { createAlpacaOrder, replaceAlpacaOrder } from "@/lib/alpaca/client";
import { toAlpacaSymbol } from "@/lib/alpaca/symbols";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OrderBody = {
  brokerAccountId: string;
  action: "place" | "replace";
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  type: "market" | "limit" | "stop" | "stop_limit";
  limit_price?: number;
  stop_price?: number;
  orderId?: string;
  client_order_id?: string;
};

/**
 * POST /api/alpaca/order
 *
 * Place or replace orders on Alpaca paper. Orders are tagged with
 * client_order_id prefix `axe-{userId}` for future per-user filtering.
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

  let body: OrderBody;
  try {
    body = (await request.json()) as OrderBody;
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

  const alpacaSymbol = toAlpacaSymbol(body.symbol);
  if (!alpacaSymbol) {
    return Response.json({ ok: false, message: `Symbol ${body.symbol} is not supported on Alpaca.` }, { status: 400 });
  }

  const clientOrderId =
    body.client_order_id ?? `axe-${user.id.slice(0, 8)}-${Date.now().toString(36)}`;

  try {
    if (body.action === "replace") {
      if (!body.orderId) {
        return Response.json({ ok: false, message: "orderId required for replace." }, { status: 400 });
      }
      const order = await replaceAlpacaOrder(config, body.orderId, {
        qty: body.qty,
        limit_price: body.limit_price,
        stop_price: body.stop_price,
      });
      return Response.json({ ok: true, order });
    }

    const order = await createAlpacaOrder(config, {
      symbol: alpacaSymbol,
      qty: body.qty,
      side: body.side,
      type: body.type,
      time_in_force: body.type === "market" ? "day" : "gtc",
      limit_price: body.limit_price,
      stop_price: body.stop_price,
      client_order_id: clientOrderId,
    });
    return Response.json({ ok: true, order });
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "Alpaca order failed." },
      { status: 422 },
    );
  }
}
