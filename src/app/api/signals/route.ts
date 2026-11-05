import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { TABLES } from "@/lib/datamodel/tables";
import { parseUserSignalInput, type UserSignalInput } from "@/lib/signals/userSignal";

/**
 * Shared signal inbox. Does not place orders — alerts→trades (C7) stays on
 * user_alerts.metadata only.
 */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from(TABLES.signals)
    .select("id,source,symbol,side,entry,sl,tp,raw_text,status,created_at,updated_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[signals] list failed:", error.message);
    return NextResponse.json({ error: "Could not load signals." }, { status: 500 });
  }
  return NextResponse.json({ signals: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: UserSignalInput;
  try {
    body = (await req.json()) as UserSignalInput;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parseUserSignalInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from(TABLES.signals)
    .insert({
      user_id: user.id,
      ...parsed.row,
      created_at: now,
      updated_at: now,
    })
    .select("id,source,symbol,side,entry,sl,tp,raw_text,status,created_at,updated_at")
    .single();

  if (error) {
    console.error("[signals] insert failed:", error.message);
    return NextResponse.json({ error: "Could not save signal." }, { status: 500 });
  }
  return NextResponse.json({ signal: data }, { status: 201 });
}
