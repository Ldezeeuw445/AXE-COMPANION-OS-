/**
 * ONE-TIME migration runner — DELETE after use.
 * Call: POST /api/internal/migrate  with header x-migration-secret: <MIGRATION_SECRET env var>
 *
 * Uses the Supabase REST API via supabase-js admin client to check table existence.
 * The actual DDL must be run directly in Supabase SQL editor.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-migration-secret");
  const expected = process.env.MIGRATION_SECRET;
  if (!expected || secret !== expected) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !key) return NextResponse.json({ error: "Missing env" }, { status: 500 });

  const supabase = createClient(url, key);

  const [c1, c2] = await Promise.all([
    supabase.from("axe_commitments").select("id").limit(1),
    supabase.from("push_subscriptions").select("id").limit(1),
  ]);

  return NextResponse.json({
    axe_commitments: c1.error ? `MISSING: ${c1.error.message}` : "EXISTS",
    push_subscriptions: c2.error ? `MISSING: ${c2.error.message}` : "EXISTS",
    message: "Run the SQL in supabase/migrations/20260405180000_axe_commitments_push.sql in your Supabase SQL editor.",
  });
}
