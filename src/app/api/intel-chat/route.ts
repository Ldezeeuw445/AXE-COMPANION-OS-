import { NextResponse } from "next/server";
import { loadIntelSnapshot } from "@/lib/intel/intelClient";
import { chatCompletionStream, type LLMChatMessage } from "@/services/llmClient";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * POST /api/intel-chat
 *
 * Dedicated streaming endpoint for the AXE INTELLIGENT AGENT chat panel.
 * Fetches the latest intel snapshot, builds a focused system prompt,
 * and streams the LLM response back as text/event-stream so the
 * client gets tokens in real-time.
 */

const INTEL_SYSTEM_PROMPT = `You are AXE INTELLIGENT AGENT — the intelligent analysis layer of AXE Companion OS.

ROLE: You are a senior institutional flow analyst with access to 10 real-time intelligence feeds — both smart-money flow and alternative data. Your job is to find *actionable correlations* across all feeds and translate them into clear trading signals or risk warnings.

FEEDS (Smart Money):
- Insider trades (Form 4 filings) — executive buying/selling
- Congressional trades — political disclosure feeds
- Dark-pool prints — off-exchange block trades
- Unusual options flow — sweeps, blocks, unusual OI
- Market tide — net call vs put premium for macro bias

FEEDS (Alternative Data):
- AXE Mobility — executive jet tracking, C-suite travel patterns
- AXE Vessel Intel — supply chain & chokepoint monitoring, tanker reroutes
- AXE Seismic Events — earthquakes, wildfires, storms, armed conflicts with market relevance
- AXE Energy Flow — crude oil inventories, natural gas storage, WTI/Brent pricing
- AXE Cyber Intel — network scanning intelligence, financial sector attack signals

CAPABILITIES:
- Cross-reference insider buys/sells with dark-pool volume to spot accumulation or distribution
- Correlate congressional trades with upcoming policy catalysts
- Read options flow (sweeps, blocks, unusual OI) for directional conviction
- Synthesize market tide (net call vs put premium) for macro bias
- Identify ticker convergence: when multiple feeds light up the same name
- Detect executive travel patterns that precede M&A or major announcements
- Connect geopolitical events to energy prices and defense/commodity sector moves
- Link supply chain disruptions to affected company flows
- Assess cyber threats to financial infrastructure for systemic risk

STYLE:
- Concise, structured, professional. Use bullet points and headers.
- Always specify the *confidence level* (high / medium / low) and the *data basis* (which feeds agree).
- If data is thin or contradictory, say so — never fabricate a signal.
- End with a clear "SIGNAL" or "NO SIGNAL" verdict when asked for direction.
- Use trading shorthand: long/short, risk-on/off, accumulation/distribution.
- Format numbers cleanly: $1.2M not $1234567.

CONTEXT: The intel data below is the latest live snapshot from AXE's intel-proxy (10 feeds). Treat it as the ground truth.`;

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

  // Alt-data feeds
  if (intel.jets?.length > 0) {
    const airborne = intel.jets.filter((j) => !j.onGround);
    const rows = airborne.length > 0
      ? airborne.slice(0, 10).map(
          (j) => `- ${j.company}: ${j.callsign || j.icao24} | alt: ${j.altitude ? Math.round(j.altitude) + "m" : "?"} | vel: ${j.velocity ? Math.round(j.velocity) + "m/s" : "?"} | from: ${j.originCountry || "?"}`
        ).join("\n")
      : `- All ${intel.jets.length} tracked executive jets are currently grounded`;
    sections.push(`## CORPORATE JET TRACKING (${airborne.length} airborne / ${intel.jets.length} tracked)\n${rows}`);
  }

  if (intel.vessels?.length > 0) {
    const rows = intel.vessels.slice(0, 10).map(
      (v) => `- ${v.vesselName}: ${v.vesselType} | ${v.owner} | ${v.nearChokepoint ? `near ${v.nearChokepoint}` : v.destination || "unknown"} | ${v.alertLevel}`
    ).join("\n");
    sections.push(`## SUPPLY CHAIN & VESSEL TRACKING (${intel.vessels.length} entries)\n${rows}`);
  }

  if (intel.conflicts?.length > 0) {
    const rows = intel.conflicts.slice(0, 10).map(
      (c) => `- ${c.country} (${c.eventDate}): ${c.eventType} ${c.subEventType ? `[${c.subEventType}]` : ""} — ${c.notes.slice(0, 150)}${c.fatalities > 0 ? ` [${c.fatalities} fatalities]` : ""}`
    ).join("\n");
    sections.push(`## AXE SEISMIC EVENTS (${intel.conflicts.length} events)\n${rows}`);
  }

  if (intel.energy?.length > 0) {
    const seen = new Set<string>();
    const rows = intel.energy.filter((e) => {
      if (seen.has(e.seriesId)) return false;
      seen.add(e.seriesId);
      return true;
    }).map(
      (e) => `- ${e.seriesName}: ${e.value != null ? e.value.toFixed(2) : "?"} ${e.unit} (${e.period})`
    ).join("\n");
    sections.push(`## AXE ENERGY FLOW\n${rows}`);
  }

  if (intel.cyber?.length > 0) {
    const rows = intel.cyber.slice(0, 10).map(
      (t) => `- ${t.ip}: ${t.classification} — ${t.name || t.category}${t.tags.length > 0 ? ` [${t.tags.join(", ")}]` : ""}`
    ).join("\n");
    sections.push(`## CYBER THREAT INTELLIGENCE (${intel.cyber.length} signals)\n${rows}`);
  }

  if (sections.length === 0) {
    return "No intel feeds are currently loaded. The intel-proxy may need to warm up.";
  }

  return sections.join("\n\n");
}

export async function POST(request: Request) {
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
  const messages: LLMChatMessage[] = [
    {
      role: "system",
      content: `${INTEL_SYSTEM_PROMPT}\n\n--- LIVE INTEL SNAPSHOT ---\n\n${intelContext}`,
    },
    // Include recent history for continuity (last 10 exchanges max)
    ...history.slice(-20).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: userMessage },
  ];

  // Stream the response via llmClient
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        await chatCompletionStream(
          { messages, maxTokens: 1200, temperature: 0.4 },
          (token) => {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ text: token })}\n\n`)
            );
          }
        );
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err) {
        console.error("[intel-chat] Stream failed:", err);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ error: "AXE couldn't generate a reply right now — please try again." })}\n\n`
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
}
