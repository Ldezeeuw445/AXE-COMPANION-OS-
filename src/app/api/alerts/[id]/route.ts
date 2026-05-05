import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

type PatchBody = {
  symbol?: string | null;
  type?: string;
  condition?: string | null;
  threshold?: number | null;
  keyword?: string | null;
  status?: "active" | "paused";
  triggered_at?: string | null;
  metadata?: Record<string, unknown>;
};

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if ("symbol" in body) patch.symbol = body.symbol ? String(body.symbol).trim().toUpperCase() : null;
  if ("type" in body) {
    const t = (body.type ?? "").trim();
    if (!t) return NextResponse.json({ error: "Missing type" }, { status: 400 });
    patch.type = t;
  }
  if ("condition" in body) patch.condition = body.condition ? String(body.condition).trim() : null;
  if ("keyword" in body) patch.keyword = body.keyword ? String(body.keyword).trim() : null;
  if ("threshold" in body) {
    patch.threshold =
      body.threshold == null
        ? null
        : Number.isFinite(Number(body.threshold))
          ? Number(body.threshold)
          : null;
  }
  if ("status" in body) patch.status = body.status === "paused" ? "paused" : "active";
  if ("triggered_at" in body) patch.triggered_at = body.triggered_at ?? null;
  if ("metadata" in body) patch.metadata = body.metadata && typeof body.metadata === "object" ? body.metadata : {};

  const { data, error } = await supabase
    .from("user_alerts")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id,symbol,type,condition,threshold,keyword,status,triggered_at,created_at,metadata")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ alert: data });
}

export async function DELETE(_: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("user_alerts")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

