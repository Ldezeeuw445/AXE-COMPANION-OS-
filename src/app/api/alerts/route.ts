import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type CreateAlertBody = {
  symbol?: string | null;
  type?: string;
  condition?: string | null;
  threshold?: number | null;
  keyword?: string | null;
  status?: "active" | "paused";
  metadata?: Record<string, unknown>;
};

export async function GET() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("user_alerts")
    .select("id,symbol,type,condition,threshold,keyword,status,triggered_at,created_at,metadata")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ alerts: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: CreateAlertBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const type = (body.type ?? "").trim();
  if (!type) return NextResponse.json({ error: "Missing type" }, { status: 400 });

  const symbol = (body.symbol ?? null) ? String(body.symbol).trim().toUpperCase() : null;
  const condition = body.condition ? String(body.condition).trim() : null;
  const keyword = body.keyword ? String(body.keyword).trim() : null;
  const threshold =
    body.threshold == null || body.threshold === ("" as unknown as number)
      ? null
      : Number.isFinite(Number(body.threshold))
        ? Number(body.threshold)
        : null;

  const status: "active" | "paused" = body.status === "paused" ? "paused" : "active";
  const metadata = body.metadata && typeof body.metadata === "object" ? body.metadata : {};

  const { data, error } = await supabase
    .from("user_alerts")
    .insert({
      user_id: user.id,
      symbol,
      type,
      condition,
      threshold,
      keyword,
      status,
      metadata,
    })
    .select("id,symbol,type,condition,threshold,keyword,status,triggered_at,created_at,metadata")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ alert: data }, { status: 201 });
}

