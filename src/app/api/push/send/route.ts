import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";
import { verifyInternalPushRequest } from "@/lib/push/internalPushAuth";

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

  let body: {
    userId?: string;
    title?: string;
    body?: string;
    url?: string;
    tag?: string;
    severity?: "info" | "alert" | "risk" | "high" | "low";
    requireInteraction?: boolean;
    silent?: boolean;
    image?: string;
    actions?: { action: string; title: string; icon?: string }[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { userId, title, body: msgBody, url, tag, severity, requireInteraction, silent, image, actions } = body;
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
    return NextResponse.json({ ok: true, sent: 0 });
  }

  const payload = JSON.stringify({
    title,
    body: msgBody ?? "",
    url: url ?? "/chat",
    tag: tag ?? "axe-notification",
    severity: severity ?? "alert",
    requireInteraction: requireInteraction ?? severity === "risk",
    silent: silent ?? false,
    image,
    actions,
  });

  const results = await Promise.allSettled(
    subs.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      )
    )
  );

  // Clean up expired subscriptions (410 Gone)
  const expired: string[] = [];
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      const err = r.reason as { statusCode?: number };
      if (err?.statusCode === 410 || err?.statusCode === 404) {
        expired.push(subs[i].endpoint);
      }
    }
  });
  if (expired.length > 0) {
    await supabase
      .from("push_subscriptions")
      .delete()
      .in("endpoint", expired)
      .eq("user_id", userId);
  }

  const sent = results.filter((r) => r.status === "fulfilled").length;
  return NextResponse.json({ ok: true, sent, total: subs.length });
}
