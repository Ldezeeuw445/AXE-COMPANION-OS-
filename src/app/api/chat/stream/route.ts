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

  const send = (event: StreamEvent) => {
    writer.write(encoder.encode(`data: ${JSON.stringify(event)}\n`)).catch(() => {});
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
      );

      if (!result.ok) {
        if (result.quotaExceeded) {
          send({ type: "error", message: "Daily message limit reached. Upgrade for unlimited access." });
        } else if (result.aiFailed) {
          send({
            type: "error",
            message:
              "AXE couldn't reach the AI model. Check that OPENAI_API_KEY is set in Vercel env vars, or that Ollama is reachable.",
          });
        } else {
          send({ type: "error", message: "Chat failed. Please try again." });
        }
      }

      await writer.write(encoder.encode("data: [DONE]\n"));
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
