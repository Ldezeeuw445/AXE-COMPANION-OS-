import type { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Save an AXE assistant reply to the user's Vault as a note.
 *
 * The Vault uses the existing `notes` table; we tag rows with `axe` so the
 * Vault UI can filter them later. Falls back gracefully if the schema does
 * not allow extra columns yet.
 *
 * Body:
 *   {
 *     content: string,
 *     title?: string,
 *     symbol?: string | null,
 *     conversationId?: string | null,
 *     messageId?: string | null,
 *     accountId?: string | null,
 *   }
 */

type Body = {
  content?: string;
  title?: string;
  symbol?: string | null;
  conversationId?: string | null;
  messageId?: string | null;
  accountId?: string | null;
};

function deriveTitle(content: string, fallback?: string): string {
  if (fallback?.trim()) return fallback.trim().slice(0, 96);
  const firstSentence = content
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s/)[0]
    ?.trim();
  if (firstSentence) return firstSentence.slice(0, 96);
  return content.slice(0, 96).trim() || "AXE note";
}

function jsonError(status: number, code: string) {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return jsonError(503, "supabase_not_configured");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError(401, "unauthorized");

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return jsonError(400, "invalid_body");
  }

  const content = (body.content ?? "").trim();
  if (!content) return jsonError(400, "empty_content");

  const title = deriveTitle(content, body.title);
  const tags = Array.from(
    new Set(
      [
        "axe",
        body.symbol ? body.symbol.toUpperCase() : null,
      ].filter((v): v is string => Boolean(v)),
    ),
  );

  const row = {
    user_id: user.id,
    title,
    body: content,
    tags,
    symbol: body.symbol ? body.symbol.toUpperCase() : null,
  };

  const { data, error } = await supabase
    .from("notes")
    .insert(row)
    .select("id")
    .maybeSingle();

  if (error) {
    return jsonError(500, "save_failed");
  }

  return Response.json({ ok: true, id: data?.id ?? null, category: "axe" });
}
