import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/serviceRole";
import {
  clientKey,
  parseSignup,
  throttleAllows,
  type ThrottleState,
} from "@/lib/marketing/waitlist";

/**
 * POST /api/waitlist — the landing page's only form.
 *
 * It used to be no endpoint at all: the component wrote to `localStorage` and
 * said thank you. This route is what makes that thank-you true. RLS denies
 * every client on `marketing_waitlist`, so the write runs on the service role
 * and the address is never readable from a browser.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const throttle: ThrottleState = new Map();

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a JSON body with an email." }, { status: 400 });
  }

  const parsed = parseSignup(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  if (!throttleAllows(throttle, clientKey(request.headers), Date.now())) {
    return NextResponse.json(
      { error: "Too many signups from here. Try again later." },
      { status: 429 },
    );
  }

  const supabase = createServiceRoleSupabaseClient();
  if (!supabase) {
    // Saying "thank you" with no database behind it is the bug this route was
    // written to fix, so an unconfigured server has to admit it.
    console.error("[waitlist] service-role client unavailable; signup not stored");
    return NextResponse.json(
      { error: "The waitlist is not available right now. Please try again later." },
      { status: 503 },
    );
  }

  const { email, surface, source } = parsed.value;
  // A plain insert rather than an upsert: the unique index is on
  // `lower(email)` so that two capitalisations of one address are one person,
  // and PostgREST's on_conflict only takes column names, never an expression.
  // A duplicate comes back as 23505, which is a success for the visitor.
  const { error } = await supabase.from("marketing_waitlist").insert({ email, surface, source });

  if (error) {
    // Same success shape as a fresh insert: whether the address was already
    // stored is not something a stranger's POST gets to learn.
    if (error.code === "23505") return NextResponse.json({ ok: true });
    console.error("[waitlist] insert failed:", error.message);
    return NextResponse.json({ error: "Could not save that just now." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
