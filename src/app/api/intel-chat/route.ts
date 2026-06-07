import { NextResponse } from "next/server";
import OpenAI from "openai";
import { loadIntelSnapshot } from "@/lib/intel/intelClient";

/**
 * POST /api/intel-chat
 *
 * Dedicated streaming endpoint for the AXE INTELLIGENT AGENT chat panel.
 * Fetches the latest intel snapshot, builds a focused system prompt,
 * and streams GPT-4o's response back as text/event-stream so the
 * client gets tokens in real-time.
 */

const INTEL_SYSTEM_PROMPT = `You are AXE INTELLIGENT AGENT — the intelligent analysis layer of AXE Companion OS.

ROLE: You are a senior institutional flow analyst with access to real-time smart-money intelligence feeds. Your job is to find *actionable correlations* across insider trades, congressional activity, dark-pool block prints, unusual options flow, and broad market tide — then translate them into clear trading signals or risk warnings.

CAPABILITIES:
- Cross-reference insider buys/sells with dark-pool volume to spot accumulation or distribution
- Correlate congressional trades with upcoming policy catalysts
- Read options flow (sweeps, blocks, unusual OI) for directional conviction
- Synthesize market tide (net call vs put premium) for macro bias
- Identify ticker convergence: when multiple feeds light up the same name

STYLE:
- Concise, structured, professional. Use bullet points and headers.
- Always specify the *confidence level* (high / medium / low) and the *data basis* (which feeds agree).
- If data is thin or contradictory, say so — never fabricate a signal.
- End with a clear "SIGNAL" or "NO SIGNAL" verdict when asked for direction.
- Use trading shorthand: long/short, risk-on/off, accumulation/distribution.
- Format numbers cleanly: $1.2M not $1234567.

CONTEXT: The intel data below is the latest live snapshot from AXE's intel-proxy. Treat it as the ground truth.`;

function buildIntelContext(intel: Awaited<ReturnType<typeof loadIntelSnapshot>>): string {
  const sections: string[] = [];

  if (intel.tide) {
    const callM = (intel.tide.netCallPremium / 1e6).toFixed(2);
    const putM = (intel.tide.netPutPremium / 1e6).toFixed(2);
    sections.push(
      `## MARKET TIDE\n- Bias: ${intel.tide.bias.toUpperCase()}\n- Net call premium: $${callM}M\n- Net put premium: $${putM}M\n- Call/put ratio: ${intel.tide.callPutRatio?.toFixed(2) ?? "—"}`
    );
  }

  if (intel.insiders.length > 0) {
    const rows = intel.insiders
      .slice(0, 15)
      .map(
        (r) =>
          `- ${r.ticker} | ${r.type} | ${r.insider}${r.role && r.role !== "—" ? ` (${r.role})` : ""} | $${(r.value / 1e6).toFixed(2)}M | ${r.date}`
      )
      .join("\n");
    sections.push(`## INSIDER TRANSACTIONS (Form 4)\n${rows}`);
  }

  if (intel.senate.length > 0) {
    const rows = intel.senate
      .slice(0, 15)
      .map(
        (r) =>
          `- ${r.ticker} | ${r.direction} | ${r.politician} (${r.chamber}) | ${r.size} | ${r.date}`
      )
      .join("\n");
    sections.push(`## CONGRESSIONAL TRADES\n${rows}`);
  }

  if (intel.darkPool.length > 0) {
    const rows = intel.darkPool
      .slice(0, 15)
      .map(
        (r) =>
          `- ${r.symbol} | ${r.size.toLocaleString()} shares @ $${r.price.toFixed(2)} | $${(r.notional / 1e6).toFixed(2)}M${r.side ? ` | ${r.side}` : ""}`
      )
      .join("\n");
    sections.push(`## DARK POOL PRINTS\n${rows}`);
  }

  if (intel.options.length > 0) {
    const rows = intel.options
      .slice(0, 15)
      .map(
        (r) =>
          `- ${r.symbol} | ${r.side} $${r.strike.toFixed(2)} ${r.exp} | Vol: ${r.vol?.toLocaleString() ?? "—"} / OI: ${r.oi?.toLocaleString() ?? "—"} | Premium: $${(r.premium / 1e6).toFixed(2)}M${r.sweep ? " [SWEEP]" : ""}`
      )
      .join("\n");
    sections.push(`## UNUSUAL OPTIONS FLOW\n${rows}`);
  }

  if (sections.length === 0) {
    return "No intel feeds are currently loaded. The intel-proxy may need to warm up.";
  }

  return sections.join("\n\n");
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "OPENAI_API_KEY not configured." },
      { status: 500 }
    );
  }

  const body = (await request.json().catch(() => null)) as {
    message?: string;
    history?: Array<{ role: "user" | "assistant"; content: string }>;
    symbol?: string;
  } | null;

  const userMessage = typeof body?.message === "string" ? body.message.trim() : "";
  if (!userMessage) {
    return NextResponse.json(
      { ok: false, error: "Empty message." },
      { status: 400 }
    );
  }

  const symbol = typeof body?.symbol === "string" ? body.symbol : undefined;
  const history = Array.isArray(body?.history) ? body.history : [];

  // Load intel snapshot
  const intel = await loadIntelSnapshot({ symbol });
  const intelContext = buildIntelContext(intel);

  // Build messages
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `${INTEL_SYSTEM_PROMPT}\n\n--- LIVE INTEL SNAPSHOT ---\n\n${intelContext}`,
    },
    // Include recent history for continuity (last 10 exchanges max)
    ...history.slice(-20).map(
      (m) =>
        ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }) satisfies OpenAI.Chat.ChatCompletionMessageParam
    ),
    { role: "user", content: userMessage },
  ];

  // Stream the response
  const client = new OpenAI({ apiKey });

  try {
    const stream = await client.chat.completions.create({
      model: "gpt-4o",
      messages,
      max_tokens: 1200,
      temperature: 0.4,
      stream: true,
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content;
            if (delta) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ text: delta })}\n\n`)
              );
            }
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: err instanceof Error ? err.message : "Stream error" })}\n\n`
            )
          );
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "OpenAI call failed.",
      },
      { status: 502 }
    );
  }
}
