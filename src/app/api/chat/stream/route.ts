import { streamChatMessage, type StreamEvent } from "@/services/chatService";
import { getEdgeAuthedServiceSupabase } from "@/services/serviceSupabase";

export const runtime = "edge";
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

  // Edge auth
  const edgeAuth = await getEdgeAuthedServiceSupabase(request);
  if (!edgeAuth) {
    return new Response(
      JSON.stringify({ ok: false, error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: StreamEvent) {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`),
          );
        } catch {
          /* controller may be closed */
        }
      }

      try {
        const result = await streamChatMessage(text, send, imageBase64, imageType, symbol, tf, edgeAuth);

        if (!result.ok) {
          if (result.quotaExceeded) {
            send({
              type: "error",
              message: "Daily free message limit reached. Upgrade to Pro for unlimited chat.",
            });
          } else if (result.aiFailed) {
            send({
              type: "error",
              message:
                "AXE couldn't generate a reply right now — please try again in a moment.",
            });
          } else {
            send({ type: "error", message: "Could not process message." });
          }
        }
      } catch (err) {
        console.error("[chat/stream] Unhandled error:", err);
        send({ type: "error", message: "Stream failed unexpectedly." });
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
