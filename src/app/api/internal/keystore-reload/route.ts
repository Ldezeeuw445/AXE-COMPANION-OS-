import { NextResponse, type NextRequest } from "next/server";
import { hasCronSecret } from "@/lib/auth/cronSecret";
import { loadKeystoreIntoEnv } from "@/lib/secrets/keystore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/internal/keystore-reload  (Authorization: Bearer <CRON_SECRET>)
 *
 * Re-reads AXE Core's keystore into this process. Without it a rotated key
 * would need a restart, and a restart of this app is a deploy — which is the
 * kind of friction that leads to keys being left wrong.
 *
 * Returns names only, never values.
 */
export async function POST(request: NextRequest) {
  if (!hasCronSecret(request.headers)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await loadKeystoreIntoEnv();
  return NextResponse.json(result, {
    status: result.error ? 502 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
