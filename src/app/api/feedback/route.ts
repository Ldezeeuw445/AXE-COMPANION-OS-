import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getUserAxeEntitlement } from "@/services/billingService";
import { FEEDBACK_MAX_CHARS, FEEDBACK_SCREENSHOT_BUCKET } from "@/lib/feedback/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const contentType = request.headers.get("content-type") ?? "";
  let text = "";
  let screenshotPath: string | null = null;

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    text = String(form.get("body") ?? "").trim();
    const file = form.get("screenshot");
    if (file && typeof file !== "string" && file.size > 0) {
      if (file.size > 5 * 1024 * 1024) {
        return NextResponse.json({ error: "Screenshot max 5 MB." }, { status: 400 });
      }
      const mime = file.type || "image/png";
      if (!mime.startsWith("image/")) {
        return NextResponse.json({ error: "Screenshot must be an image." }, { status: 400 });
      }
      const ext = mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : mime === "image/gif" ? "gif" : "png";
      const path = `${user.id}/${Date.now()}.${ext}`;
      const buf = Buffer.from(await file.arrayBuffer());
      const { error: upErr } = await supabase.storage
        .from(FEEDBACK_SCREENSHOT_BUCKET)
        .upload(path, buf, { contentType: mime, upsert: false });
      if (upErr) {
        console.error("[feedback] screenshot upload failed:", upErr.message);
        return NextResponse.json({ error: "Could not upload screenshot." }, { status: 500 });
      }
      screenshotPath = path;
    }
  } else {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Send JSON or multipart with body." }, { status: 400 });
    }
    text = String((body as { body?: unknown })?.body ?? "").trim();
  }

  if (text.length < 1 || text.length > FEEDBACK_MAX_CHARS) {
    return NextResponse.json(
      { error: `Feedback must be 1–${FEEDBACK_MAX_CHARS} characters.` },
      { status: 400 },
    );
  }

  const ent = await getUserAxeEntitlement(supabase, user.id);
  const founderTagged = ent.plan === "founder" || ent.founderBadge;

  const { data, error } = await supabase
    .from("axe_product_feedback")
    .insert({
      user_id: user.id,
      body: text,
      screenshot_path: screenshotPath,
      plan: ent.plan,
      founder_tagged: founderTagged,
    })
    .select("id,founder_tagged,created_at")
    .single();

  if (error) {
    console.error("[feedback] insert failed:", error.message);
    return NextResponse.json({ error: "Could not save that just now." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, feedback: data });
}
