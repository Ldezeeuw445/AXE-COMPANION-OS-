/**
 * POST /api/alerts/[id]/trigger
 *
 * Stand-alone alert delivery for Trading OS. Called by the in-app
 * evaluator (e.g. when a live tick on the chart crosses a price threshold).
 *
 * Behaviour:
 *  - Marks the alert as triggered server-side (`triggered_at` = now).
 *  - Best-effort web push if VAPID + a subscription exist; the alert still
 *    counts as triggered when push is missing — the UI surfaces it in-app.
 *
 * The route is intentionally idempotent: passing the same payload twice
 * within `cooldownSeconds` (default 60s) is a no-op so we don't spam the
 * user when the price oscillates around the threshold.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type Body = {
  price?: number | null;
  message?: string | null;
  cooldownSeconds?: number | null;
};

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    /* empty body is fine */
  }

  const cooldownSeconds = Number.isFinite(Number(body.cooldownSeconds))
    ? Math.max(5, Math.min(3600, Number(body.cooldownSeconds)))
    : 60;

  const { data: existing, error: fetchErr } = await supabase
    .from("user_alerts")
    .select("id,symbol,type,condition,threshold,keyword,status,triggered_at,metadata")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (fetchErr || !existing) {
    return NextResponse.json({ error: fetchErr?.message ?? "Alert not found" }, { status: 404 });
  }

  if (existing.status !== "active") {
    return NextResponse.json({ ok: true, skipped: "paused" });
  }

  if (existing.triggered_at) {
    const last = Date.parse(existing.triggered_at);
    if (Number.isFinite(last) && Date.now() - last < cooldownSeconds * 1000) {
      return NextResponse.json({ ok: true, skipped: "cooldown" });
    }
  }

  const now = new Date().toISOString();
  const metadata = {
    ...(existing.metadata && typeof existing.metadata === "object" ? existing.metadata : {}),
    last_trigger_price: body.price ?? null,
    last_trigger_message: body.message ?? null,
    last_trigger_at: now,
  };

  const { error: updateErr } = await supabase
    .from("user_alerts")
    .update({ triggered_at: now, metadata })
    .eq("id", id)
    .eq("user_id", user.id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // Best-effort push delivery — fire and forget. If VAPID isn't configured
  // or the user has no subscribed device, /api/push/send returns gracefully
  // and we still consider the trigger successful (in-app already shows it).
  let pushed = false;
  try {
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
    const message =
      body.message ??
      buildDefaultMessage(existing.symbol, existing.condition, existing.threshold, body.price);
    const res = await fetch(`${baseUrl}/api/push/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: user.id,
        title: `Alert · ${existing.symbol ?? existing.type}`,
        body: message,
        url: existing.symbol ? `/chart?symbol=${existing.symbol}` : "/alerts",
        tag: `alert-${id}`,
      }),
    });
    pushed = res.ok;
  } catch {
    pushed = false;
  }

  return NextResponse.json({ ok: true, triggered_at: now, pushed });
}

function buildDefaultMessage(
  symbol: string | null,
  condition: string | null,
  threshold: number | null,
  price: number | null | undefined,
): string {
  const parts: string[] = [];
  if (symbol) parts.push(symbol);
  if (condition && threshold != null) parts.push(`${condition} ${threshold}`);
  if (price != null && Number.isFinite(price)) parts.push(`(now ${price})`);
  return parts.length ? parts.join(" ") : "Alert fired";
}
