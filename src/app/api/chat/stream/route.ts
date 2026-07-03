import { streamChatMessage, type StreamEvent } from "@/services/chatService";
import { getAuthedServiceSupabase } from "@/services/serviceSupabase";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createClient as createServiceRoleClient } from "@supabase/supabase-js";

// Node.js runtime — metaApiClient uses node:crypto
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Allow up to 300 s on Pro — Ollama VPS + context assembly can exceed 60 s
export const maxDuration = 300;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { text?: unknown; imageBase64?: unknown; imageType?: unknown; symbol?: unknown; tf?: unknown; type?: unknown }
    | null;

  const text = typeof body?.text === "string" ? body.text : "";
  const imageBase64 = typeof body?.imageBase64 === "string" ? body.imageBase64 : undefined;
  const imageType = typeof body?.imageType === "string" ? body.imageType : undefined;
  const symbol = typeof body?.symbol === "string" ? body.symbol : undefined;
  const tf = typeof body?.tf === "string" ? body.tf : undefined;
  const chatType = body?.type === "intel" ? "intel" : "axe";

  // Server auth: try Bearer token first, then fall back to cookie session.
  let edgeAuth = await getAuthedServiceSupabase();

  if (!edgeAuth) {
    // Fallback: extract JWT from Authorization header (sent by Composer)
    const authHeader = request.headers.get("Authorization") ?? "";
    const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    if (bearerToken) {
      try {
        const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const serviceKey =
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
          process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
          "";
        const sbClient = createServiceRoleClient(serviceUrl, serviceKey, {
          global: { headers: { Authorization: `Bearer ${bearerToken}` } },
        });
        const { data: { user }, error } = await sbClient.auth.getUser(bearerToken);
        if (!error && user) {
          edgeAuth = { supabase: sbClient as ReturnType<typeof createServiceRoleClient>, user };
        }
      } catch {
        // Bearer auth also failed — fall through to 401
      }
    }
  }

  if (!edgeAuth) {
    return new Response(
      JSON.stringify({ ok: false, error: "Unauthorized — please log in and try again." }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();

  // SSE format: event name on its own line, then data, then blank line.
  // The Composer listens for `event: <type>` to route tokens/errors/done.
  const send = (event: StreamEvent) => {
    const frame = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
    writer.write(encoder.encode(frame)).catch(() => {});
  };

  // Fire-and-forget — the stream is already attached to the response
  (async () => {
    try {
      const result = await streamChatMessage(
        text,
        send,
        imageBase64,
        imageType,
        symbol,
        tf,
        edgeAuth,
        chatType,
      );

      if (!result.ok) {
        if (result.quotaExceeded) {
          send({ type: "error", message: "Daily message limit reached. Upgrade for unlimited access." });
        } else if (result.aiFailed) {
          const detail = result.errorDetail ?? "Unknown AI error";
          send({
            type: "error",
            message: detail.includes("quota") || detail.includes("unavailable")
              ? detail
              : `AXE couldn't reach the AI model — ${detail}`,
          });
        } else {
          send({ type: "error", message: "Chat failed. Please try again." });
        }
      }

      // [DONE] sentinel — Composer uses the `done` event from chatService; this is a safety net.
      await writer.write(encoder.encode("data: [DONE]\n\n"));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      send({ type: "error", message: msg });
      await writer.write(encoder.encode("data: [DONE]\n")).catch(() => {});
    } finally {
      writer.close().catch(() => {});
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
