import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { getAuthedServiceSupabase } from "@/services/serviceSupabase";

/**
 * POST /api/push/test
 *
 * Sends a test push notification to every device the signed-in user has
 * subscribed. Used by the Settings push panel so a user can verify that
 * their lock-screen / home-screen delivery actually works after granting
 * permission, without waiting for a real alert to trip.
 *
 * Auth is required — anonymous callers can't push to other users.
 */
export async function POST(_req: NextRequest): Promise<NextResponse> {
  void _req;
  const subject = process.env.VAPID_SUBJECT;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!subject || !publicKey || !privateKey) {
    return NextResponse.json({ error: "VAPID not configured on this server" }, { status: 500 });
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);

  const authed = await getAuthedServiceSupabase();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { supabase, user } = authed;

  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("endpoint,p256dh,auth")
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!subs || subs.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, total: 0 });
  }

  const payload = JSON.stringify({
    title: "AXE — test notification",
    body: "If you can see this on the lock screen with sound or vibration, push is wired correctly.",
    url: "/settings",
    tag: "axe-test",
    severity: "alert",
    requireInteraction: false,
    actions: [{ action: "open", title: "Open AXE" }],
  });

  const results = await Promise.allSettled(
    subs.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      ),
    ),
  );

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
      .eq("user_id", user.id);
  }

  const sent = results.filter((r) => r.status === "fulfilled").length;
  return NextResponse.json({ ok: true, sent, total: subs.length });
}
