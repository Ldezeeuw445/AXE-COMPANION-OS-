import { loadIntelSnapshot } from "@/lib/intel/intelClient";
import { callLLM, type LLMMessage } from "@/services/llmClient";

/**
 * Shared cross-feed correlation logic — extracted from
 * src/app/api/intel-correlate/route.ts so both the user-triggered button
 * route and the scheduled cron route (src/app/api/cron/intel-correlate)
 * run the exact same analysis instead of two copies that can drift.
 */

export type CorrelationResult = {
  id: string;
  title: string;
  summary: string;
  confidence: "high" | "medium" | "low";
  signal: string | null;
  feedsUsed: string[];
  symbols: string[];
};

export function getFeedCounts(intel: Awaited<ReturnType<typeof loadIntelSnapshot>>): Record<string, number> {
  return {
    insiders: intel.insiders.length,
    senate: intel.senate.length,
    darkPool: intel.darkPool.length,
    options: intel.options.length,
    jets: intel.jets.length,
    vessels: intel.vessels.length,
    conflicts: intel.conflicts.length,
    energy: intel.energy.length,
    cyber: intel.cyber.length,
  };
}

function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return "?";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1)}K`;
  return `${sign}${abs.toFixed(0)}`;
}

export function buildIntelContext(
  intel: Awaited<ReturnType<typeof loadIntelSnapshot>>,
  symbol?: string,
): string {
  const parts: string[] = [];

  if (symbol) parts.push(`Target symbol: ${symbol}\n`);

  if (intel.insiders.length > 0) {
    parts.push(`## INSIDER TRANSACTIONS (${intel.insiders.length} trades)`);
    for (const t of intel.insiders.slice(0, 10)) {
      parts.push(`- ${t.ticker}: ${t.insider} (${t.role ?? "?"}) ${t.type} $${formatCompact(t.value)} on ${t.date}`);
    }
  }

  if (intel.senate.length > 0) {
    parts.push(`\n## CONGRESSIONAL TRADES (${intel.senate.length} disclosures)`);
    for (const t of intel.senate.slice(0, 10)) {
      parts.push(`- ${t.ticker}: ${t.politician} (${t.chamber}) ${t.direction} ${t.size} on ${t.date}`);
    }
  }

  if (intel.darkPool.length > 0) {
    parts.push(`\n## DARK POOL PRINTS (${intel.darkPool.length} prints)`);
    for (const p of intel.darkPool.slice(0, 10)) {
      parts.push(`- ${p.symbol}: $${p.price.toFixed(2)} × ${p.size.toLocaleString()} = $${formatCompact(p.notional)}${p.side ? ` (${p.side})` : ""}`);
    }
  }

  if (intel.options.length > 0) {
    parts.push(`\n## UNUSUAL OPTIONS (${intel.options.length} flows)`);
    for (const o of intel.options.slice(0, 10)) {
      parts.push(`- ${o.symbol}: $${o.strike} ${o.side} exp ${o.exp} premium $${formatCompact(o.premium)}${o.sweep ? " SWEEP" : ""}`);
    }
  }

  if (intel.tide) {
    parts.push(`\n## MARKET TIDE`);
    parts.push(`- Net call premium: $${formatCompact(intel.tide.netCallPremium)}`);
    parts.push(`- Net put premium: $${formatCompact(intel.tide.netPutPremium)}`);
    parts.push(`- Bias: ${intel.tide.bias}`);
  }

  if (intel.jets.length > 0) {
    const airborne = intel.jets.filter((j) => !j.onGround);
    parts.push(`\n## CORPORATE JET TRACKING (${airborne.length} airborne / ${intel.jets.length} tracked)`);
    for (const j of airborne.slice(0, 10)) {
      parts.push(`- ${j.company}: ${j.callsign || j.icao24} — alt ${j.altitude ? Math.round(j.altitude) + "m" : "?"}, vel ${j.velocity ? Math.round(j.velocity) + "m/s" : "?"}, from ${j.originCountry || "?"}`);
    }
    if (airborne.length === 0) {
      parts.push(`- All ${intel.jets.length} tracked executive jets are currently grounded`);
    }
  }

  if (intel.vessels.length > 0) {
    parts.push(`\n## SUPPLY CHAIN & VESSEL TRACKING (${intel.vessels.length} entries)`);
    for (const v of intel.vessels.slice(0, 10)) {
      parts.push(`- ${v.vesselName}: ${v.vesselType} — ${v.owner} | ${v.nearChokepoint ? `near ${v.nearChokepoint}` : v.destination || "unknown"} | ${v.alertLevel}`);
    }
  }

  if (intel.conflicts.length > 0) {
    parts.push(`\n## AXE SEISMIC EVENTS (${intel.conflicts.length} events)`);
    for (const c of intel.conflicts.slice(0, 10)) {
      parts.push(`- ${c.country} (${c.eventDate}): ${c.eventType} ${c.subEventType ? `[${c.subEventType}]` : ""} — ${c.notes.slice(0, 150)}${c.fatalities > 0 ? ` [${c.fatalities} fatalities]` : ""}`);
    }
  }

  if (intel.energy.length > 0) {
    parts.push(`\n## ENERGY FLOWS (${intel.energy.length} data points)`);
    const seen = new Set<string>();
    for (const e of intel.energy) {
      if (seen.has(e.seriesId)) continue;
      seen.add(e.seriesId);
      parts.push(`- ${e.seriesName}: ${e.value != null ? e.value.toFixed(2) : "?"} ${e.unit} (${e.period})`);
    }
  }

  if (intel.cyber.length > 0) {
    parts.push(`\n## CYBER THREAT INTELLIGENCE (${intel.cyber.length} signals)`);
    for (const t of intel.cyber.slice(0, 10)) {
      parts.push(`- ${t.ip}: ${t.classification} — ${t.name || t.category}${t.tags.length > 0 ? ` [${t.tags.join(", ")}]` : ""}`);
    }
  }

  return parts.join("\n");
}

export async function runCorrelationAnalysis(
  context: string,
  symbol?: string,
): Promise<CorrelationResult> {
  const systemPrompt = `You are AXE Correlation Engine — an AI analyst that finds actionable cross-feed correlations in alternative data for traders.

You receive a snapshot of 10 intelligence feeds:
- Smart money: insider trades, congressional trades, dark pool prints, unusual options, market tide
- Alt-data: corporate jet tracking (executive travel), supply chain/vessel tracking, conflict/geopolitical events, energy flows (oil/gas), cyber threat intelligence

Your job: Find the MOST INTERESTING cross-feed correlation — something that connects data points across 2+ different feeds that could indicate a trading signal.

Examples of correlations:
- Executive jets from oil companies moving to Middle East + conflict events in same region + energy price spike
- Insider buying in defense stocks + conflict escalation + unusual call options in same sector
- Dark pool buying in tech + CEO jet activity + supply chain disruption signals
- Congressional selling in energy + EIA inventory build + bearish options flow
- Cyber attacks on financial infrastructure + dark pool selling + market tide shifting bearish

Respond in EXACTLY this JSON format (no markdown, no code fences):
{
  "title": "Short descriptive title (max 60 chars)",
  "summary": "2-4 sentence analysis explaining the correlation, what feeds connect, and the potential trading implication. Be specific with data points.",
  "confidence": "high" | "medium" | "low",
  "signal": "BULLISH" | "BEARISH" | "NEUTRAL" | null,
  "feedsUsed": ["feed1", "feed2", ...],
  "symbols": ["SYM1", "SYM2", ...]
}

Feed names for feedsUsed: insiderTrades, senateTrades, darkPool, unusualOptions, marketTide, corporateJets, vesselTracking, conflictEvents, energyFlows, cyberThreats

If there isn't enough data for a meaningful correlation, still find the best one you can and set confidence to "low".`;

  const userPrompt = `Analyze this intel snapshot and find the most actionable cross-feed correlation${symbol ? ` (focus on ${symbol} if relevant)` : ""}:

${context}`;

  const messages: LLMMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  const result = await callLLM({
    messages,
    temperature: 0.7,
    max_tokens: 800,
  }, 'intel');

  if (!result.content) throw new Error("Empty LLM response");

  const cleaned = result.content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const parsed = JSON.parse(cleaned) as {
    title: string;
    summary: string;
    confidence: string;
    signal: string | null;
    feedsUsed: string[];
    symbols: string[];
  };

  return {
    id: `corr-${Date.now()}`,
    title: String(parsed.title ?? "Cross-Feed Correlation").slice(0, 100),
    summary: String(parsed.summary ?? "").slice(0, 2000),
    confidence: (["high", "medium", "low"].includes(parsed.confidence) ? parsed.confidence : "medium") as "high" | "medium" | "low",
    signal: parsed.signal ? String(parsed.signal).toUpperCase() : null,
    feedsUsed: Array.isArray(parsed.feedsUsed) ? parsed.feedsUsed.map(String) : [],
    symbols: Array.isArray(parsed.symbols) ? parsed.symbols.map(String) : [],
  };
}
