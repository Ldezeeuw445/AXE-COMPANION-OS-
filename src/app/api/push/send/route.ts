import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";
import { verifyInternalPushRequest } from "@/lib/push/internalPushAuth";
import {
  buildPushNotificationPayload,
  summarizePushDelivery,
  type PushDeliveryRequest,
  type PushSendResult,
} from "@/lib/push/deliverPushPayload";

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function configureVapid() {
  const subject = process.env.VAPID_SUBJECT;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!subject || !publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

export async function POST(req: NextRequest) {
  const auth = verifyInternalPushRequest(req.headers);
  if (auth === "missing_secret") {
    return NextResponse.json({ error: "Internal push secret not configured" }, { status: 503 });
  }
  if (auth === "forbidden") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!configureVapid()) {
    return NextResponse.json({ error: "VAPID not configured" }, { status: 500 });
  }

  let body: PushDeliveryRequest;
  try {
    body = (await req.json()) as PushDeliveryRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { userId, title } = body;
  if (!userId || !title) {
    return NextResponse.json({ error: "Missing userId or title" }, { status: 400 });
  }

  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Service client unavailable" }, { status: 500 });
  }

  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("endpoint,p256dh,auth")
    .eq("user_id", userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!subs || subs.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, total: 0 });
  }

  const payload = buildPushNotificationPayload(body);

  const settled = await Promise.allSettled(
    subs.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      ),
    ),
  );

  const results: PushSendResult[] = settled.map((r) => {
    if (r.status === "fulfilled") return { status: "fulfilled" };
    const err = r.reason as { statusCode?: number };
    return { status: "rejected", statusCode: err?.statusCode };
  });

  const summary = summarizePushDelivery({ subscriptions: subs, results });
  if (summary.expiredEndpoints.length > 0) {
    await supabase
      .from("push_subscriptions")
      .delete()
      .in("endpoint", summary.expiredEndpoints)
      .eq("user_id", userId);
  }

  return NextResponse.json({
    ok: true,
    sent: summary.sent,
    total: summary.total,
  });
}
