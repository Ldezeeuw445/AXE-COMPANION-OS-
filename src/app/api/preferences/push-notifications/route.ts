import { NextRequest } from "next/server";
import { sanitizePushPrefs } from "@/lib/push/prefs";
import {
  getPushNotificationPrefsServerState,
  savePushNotificationPrefs,
} from "@/lib/push/serverPrefs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const prefs = await getPushNotificationPrefsServerState();
  return Response.json(prefs);
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const result = await savePushNotificationPrefs(sanitizePushPrefs(body));
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }
  return Response.json({ ok: true, ...result.prefs });
}
