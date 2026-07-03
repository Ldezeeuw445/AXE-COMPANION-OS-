import type { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAlpacaPaperConfig } from "@/lib/alpaca/env";
import { replaceAlpacaOrder } from "@/lib/alpaca/client";
import { alpacaQtyFromAxeVolume } from "@/lib/alpaca/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ModifyBody = {
  brokerAccountId: string;
  orderId: string;
  openPrice?: number | null;
  stopLoss?: number | null;
  takeProfit?: number | null;
  volume?: number | null;
};

/**
 * Replace an open Alpaca limit/stop order price (and optionally qty).
 * Bracket child orders are not modified here — only the primary pending order.
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

  if (!body.orderId?.trim()) {
    return Response.json({ ok: false, message: "orderId required." }, { status: 400 });
  }

  const patch: {
    qty?: number;
    limit_price?: number;
    stop_price?: number;
  } = {};

  if (body.volume != null && Number.isFinite(body.volume) && body.volume > 0) {
    patch.qty = alpacaQtyFromAxeVolume(body.volume);
  }
  if (body.openPrice != null && Number.isFinite(body.openPrice) && body.openPrice > 0) {
    patch.limit_price = body.openPrice;
    patch.stop_price = body.openPrice;
  }

  if (Object.keys(patch).length === 0 && body.stopLoss == null && body.takeProfit == null) {
    return Response.json({ ok: false, message: "Nothing to modify." }, { status: 400 });
  }

  try {
    const order = await replaceAlpacaOrder(config, body.orderId, patch);
    return Response.json({
      ok: true,
      order,
      message:
        body.stopLoss != null || body.takeProfit != null
          ? "Entry price updated. Re-send the order to attach new bracket stops on Alpaca."
          : "Order updated on Alpaca.",
    });
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "Alpaca modify failed." },
      { status: 422 },
    );
  }
}
