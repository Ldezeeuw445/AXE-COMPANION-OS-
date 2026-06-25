import { streamChatMessage, type StreamEvent } from "@/services/chatService";
import { getEdgeAuthedServiceSupabase } from "@/services/serviceSupabase";

// Removed: export const runtime = "edge";
// This route needs Node.js runtime to support metaApiClient (uses node:crypto)
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
      try {
        const events = await streamChatMessage({
          userId: edgeAuth.userId,
          text,
          imageBase64,
          imageType,
          symbol,
          tf,
        });

        for await (const event of events) {
          const line = JSON.stringify(event);
          controller.enqueue(
            encoder.encode(`data: ${line}\n`)
          );
        }
        controller.enqueue(encoder.encode("data: [DONE]\n"));
        controller.close();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        const errorEvent: StreamEvent = {
          type: "error",
          message: errorMessage,
        };
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(errorEvent)}\n`)
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
