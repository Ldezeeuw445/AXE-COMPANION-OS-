import { streamChatMessage, type StreamEvent } from "@/services/chatService";
import { getAuthedServiceSupabase } from "@/services/serviceSupabase";

// Node.js runtime — metaApiClient uses node:crypto
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { text?: unknown; imageBase64?: unknown; imageType?: unknown; symbol?: unknown; tf?: unknown }
    | null;

  const text = typeof body?.text === "string" ? body.text : "";
  const imageBase64 = typeof body?.imageBase64 === "string" ? body.imageBase64 : undefined;
  const imageType = typeof body?.imageType === "string" ? body.imageType : undefined;
  const symbol = typeof body?.symbol === "string" ? body.symbol : undefined;
  const tf = typeof body?.tf === "string" ? body.tf : undefined;

  // Server auth — returns { supabase, user } or null
  const edgeAuth = await getAuthedServiceSupabase();
  if (!edgeAuth) {
    return new Response(
      JSON.stringify({ ok: false, error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();

  // Fire-and-forget — the stream is already attached to the response
  (async () => {
    try {
      await streamChatMessage(
        text,
        (event: StreamEvent) => {
          const line = JSON.stringify(event);
          // intentionally fire without await — writer.write is ordered/buffered
          writer.write(encoder.encode(`data: ${line}\n`)).catch(() => {});
        },
        imageBase64,
        imageType,
        symbol,
        tf,
        edgeAuth,           // { supabase, user } matches the expected shape
      );
      await writer.write(encoder.encode("data: [DONE]\n"));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      const errorEvent: StreamEvent = { type: "error", message: msg };
      await writer.write(encoder.encode(`data: ${JSON.stringify(errorEvent)}\n`)).catch(() => {});
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
