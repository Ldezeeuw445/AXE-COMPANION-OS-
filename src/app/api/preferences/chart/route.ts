import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  MAX_PREF_VALUE_LENGTH,
  accountScope,
  sanitisePrefs,
  symbolScope,
  type ChartPrefRow,
} from "@/lib/chart/chartPrefs";

/**
 * GET/POST /api/preferences/chart
 *
 * The trader's chart setup, so it survives a new phone, follows them into
 * Trading OS, and — the part that matters most — can be read by AXE. See
 * src/lib/chart/chartPrefs.ts for why it used to live only in localStorage
 * and what that cost.
 *
 * Reads and writes as the signed-in user, never with the service role: RLS on
 * `user_chart_preferences` is then the thing enforcing that a chart setup is
 * personal, rather than a `.eq("user_id", ...)` somebody can forget.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One page load should never pull an unbounded number of scopes. */
const MAX_ROWS = 400;
/** One request writes one scope; a device with more than this is not real. */
const MAX_SCOPES_PER_WRITE = 40;

export async function GET() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("user_chart_preferences")
    .select("account_key, symbol_key, prefs, updated_at")
    .order("updated_at", { ascending: false })
    .limit(MAX_ROWS);

  if (error) {
    console.error("[chart-prefs] read failed:", error.message);
    // An empty list and an unreadable one are different things, and a chart
    // that silently resets to defaults because of a failed read is the kind
    // of bug nobody reports because it looks like a design decision.
    return NextResponse.json({ error: "Could not read your chart setup." }, { status: 500 });
  }

  const scopes: ChartPrefRow[] = (data ?? []).map((row) => ({
    accountKey: String(row.account_key),
    symbolKey: String(row.symbol_key),
    prefs: sanitisePrefs(row.prefs, {
      accountKey: String(row.account_key),
      symbolKey: String(row.symbol_key),
    }),
    updatedAt: String(row.updated_at),
  }));

  return NextResponse.json({ scopes }, { headers: { "Cache-Control": "no-store" } });
}

type WriteScope = { accountId?: unknown; symbol?: unknown; prefs?: unknown };

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { scopes?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const incoming = Array.isArray(body.scopes) ? (body.scopes as WriteScope[]) : null;
  if (!incoming) return NextResponse.json({ error: "scopes must be an array." }, { status: 400 });
  if (incoming.length > MAX_SCOPES_PER_WRITE) {
    return NextResponse.json({ error: "Too many scopes in one write." }, { status: 413 });
  }

  const now = new Date().toISOString();
  const rows = [];
  for (const scope of incoming) {
    const accountKey = accountScope(typeof scope.accountId === "string" ? scope.accountId : null);
    const symbolKey = symbolScope(typeof scope.symbol === "string" ? scope.symbol : null);
    // Allowlisted keys, capped values, and only keys that belong in this
    // scope — the column is jsonb and the body is whatever was sent.
    const prefs = sanitisePrefs(scope.prefs, { accountKey, symbolKey });
    if (Object.keys(prefs).length === 0) continue;
    rows.push({
      user_id: user.id,
      account_key: accountKey,
      symbol_key: symbolKey,
      prefs,
      updated_at: now,
    });
  }

  if (rows.length === 0) {
    // Nothing recognisable. Saying so beats a cheerful 200 over a no-op,
    // which is how a preference that never saved looks exactly like one
    // that did.
    return NextResponse.json(
      { error: `No storable preferences in that request (values cap at ${MAX_PREF_VALUE_LENGTH} chars).` },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("user_chart_preferences")
    .upsert(rows, { onConflict: "user_id,account_key,symbol_key" });

  if (error) {
    console.error("[chart-prefs] write failed:", error.message);
    return NextResponse.json({ error: "Could not save your chart setup." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, saved: rows.length, updatedAt: now });
}
