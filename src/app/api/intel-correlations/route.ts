import { createEdgeSupabaseClient } from "@/lib/supabase/edge";
import { loadIntelSnapshot } from "@/lib/intel/intelClient";
import { callLLM, type LLMMessage, type LLMRequest } from "@/services/llmClient";

export const dynamic = "force-dynamic";

/**
 * POST /api/intel-correlations
 *
 * AXE Correlation Engine — finds MULTIPLE cross-feed correlations,
 * checks historical patterns for déjà-vu matches, and returns
 * both current correlations + historical context.
 *
 * Cached for 30 min to avoid LLM abuse.
 */

type FeedSignal = { feed: string; signal: string };

type Correlation = {
  id: string;
  title: string;
  summary: string;
  confidence: "high" | "medium" | "low";
  signal: "BULLISH" | "BEARISH" | "NEUTRAL" | null;
  feedsUsed: string[];
  symbols: string[];
  supporting: FeedSignal[];
};

type HistoricalMatch = {
  title: string;
  date: string;
  similarity: "strong" | "moderate";
};

type CorrelationSnapshot = {
  correlations: Correlation[];
  historicalMatches: HistoricalMatch[];
  generatedAt: string;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const CACHE_TTL_MS = 30 * 60 * 1000;

async function getCachedSnapshot(
  supabase: ReturnType<typeof createEdgeSupabaseClient>,
  userId: string,
): Promise<CorrelationSnapshot | null> {
  if (!supabase) return null;
  const { data } = await supabase
    .from("axe_correlation_snapshots")
    .select("correlations,historical_matches,generated_at")
    .eq("user_id", userId)
    .order("generated_at", { ascending: false })
    .limit(1)
    .single();

  if (!data) return null;
  const age = Date.now() - new Date(data.generated_at as string).getTime();
  if (age > CACHE_TTL_MS) return null;

  return {
    correlations: data.correlations as Correlation[],
    historicalMatches: (data.historical_matches as HistoricalMatch[]) ?? [],
    generatedAt: data.generated_at as string,
  };
}

export async function POST(request: Request) {
  const supabase = createEdgeSupabaseClient(request);
  if (!supabase) return jsonResponse({ ok: false, error: "supabase_not_configured" }, 503);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonResponse({ ok: false, error: "unauthorized" }, 401);

  // Return cached if fresh
  const cached = await getCachedSnapshot(supabase, user.id);
  if (cached) return jsonResponse({ ok: true, cached: true, snapshot: cached });

  // Load intel snapshot
  const intel = await loadIntelSnapshot();

  try {
    const snapshot = await generateCorrelationSnapshot(intel);

    // Persist
    try {
      await supabase.from("axe_correlation_snapshots").insert({
        user_id: user.id,
        correlations: snapshot.correlations,
        historical_matches: snapshot.historicalMatches,
        generated_at: snapshot.generatedAt,
      });
    } catch {
      /* best effort */
    }

    return jsonResponse({ ok: true, cached: false, snapshot });
  } catch (e) {
    console.error("[intel-correlations] Failed:", e);
    return jsonResponse(
      { ok: false, error: "AXE couldn't generate correlations right now — please try again in a moment." },
      503,
    );
  }
}

/* ── Build intel context for GPT ──────────────────────────────────── */

function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return "?";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1)}K`;
  return `${sign}${abs.toFixed(0)}`;
}

function buildIntelContext(intel: Awaited<ReturnType<typeof loadIntelSnapshot>>): string {
  const parts: string[] = [];

  if (intel.insiders.length > 0) {
    parts.push(`## INSIDER TRANSACTIONS (${intel.insiders.length})`);
    for (const t of intel.insiders.slice(0, 10)) {
      parts.push(`- ${t.ticker}: ${t.insider} ${t.type} $${formatCompact(t.value)} (${t.date})`);
    }
  }

  if (intel.senate.length > 0) {
    parts.push(`\n## CONGRESSIONAL TRADES (${intel.senate.length})`);
    for (const t of intel.senate.slice(0, 10)) {
      parts.push(`- ${t.ticker}: ${t.politician} ${t.direction} ${t.size} (${t.date})`);
    }
  }

  if (intel.darkPool.length > 0) {
    parts.push(`\n## DARK POOL (${intel.darkPool.length})`);
    for (const p of intel.darkPool.slice(0, 10)) {
      parts.push(`- ${p.symbol}: $${p.price.toFixed(2)} × ${p.size.toLocaleString()} = $${formatCompact(p.notional)}${p.side ? ` (${p.side})` : ""}`);
    }
  }

  if (intel.options.length > 0) {
    parts.push(`\n## UNUSUAL OPTIONS (${intel.options.length})`);
    for (const o of intel.options.slice(0, 10)) {
      parts.push(`- ${o.symbol}: $${o.strike} ${o.side} exp ${o.exp} $${formatCompact(o.premium)}${o.sweep ? " SWEEP" : ""}`);
    }
  }

  if (intel.tide) {
    parts.push(`\n## MARKET TIDE`);
    parts.push(`- Call premium: $${formatCompact(intel.tide.netCallPremium)}, Put: $${formatCompact(intel.tide.netPutPremium)}, Bias: ${intel.tide.bias}`);
  }

  if (intel.jets.length > 0) {
    const airborne = intel.jets.filter((j) => !j.onGround);
    parts.push(`\n## CORPORATE JETS (${airborne.length} airborne / ${intel.jets.length} tracked)`);
    for (const j of intel.jets.slice(0, 10)) {
      parts.push(`- ${j.company}: ${j.callsign || j.icao24} — alt ${j.altitude ? Math.round(j.altitude) + "m" : "?"}, vel ${j.velocity ? Math.round(j.velocity) + "m/s" : "?"}`);
    }
  }

  if (intel.vessels.length > 0) {
    parts.push(`\n## VESSEL TRACKING (${intel.vessels.length})`);
    for (const v of intel.vessels.slice(0, 10)) {
      parts.push(`- ${v.vesselName}: ${v.vesselType} — ${v.owner} | ${v.nearChokepoint ? `near ${v.nearChokepoint}` : v.destination || "?"} | ${v.alertLevel}`);
    }
  }

  if (intel.conflicts.length > 0) {
    parts.push(`\n## SEISMIC EVENTS (${intel.conflicts.length})`);
    for (const c of intel.conflicts.slice(0, 10)) {
      parts.push(`- ${c.country}: ${c.eventType}${c.subEventType ? ` [${c.subEventType}]` : ""} — ${c.notes.slice(0, 120)}`);
    }
  }

  if (intel.energy.length > 0) {
    parts.push(`\n## ENERGY FLOWS (${intel.energy.length})`);
    const seen = new Set<string>();
    for (const e of intel.energy) {
      if (seen.has(e.seriesId)) continue;
      seen.add(e.seriesId);
      parts.push(`- ${e.seriesName}: ${e.value != null ? e.value.toFixed(2) : "?"} ${e.unit} (${e.period})`);
    }
  }

  if (intel.cyber.length > 0) {
    parts.push(`\n## CYBER THREATS (${intel.cyber.length})`);
    for (const t of intel.cyber.slice(0, 10)) {
      parts.push(`- ${t.ip}: ${t.classification} — ${t.name || t.category}${t.tags.length > 0 ? ` [${t.tags.join(", ")}]` : ""}`);
    }
  }

  return parts.join("\n");
}

/* ── GPT-4o Multiple Correlation Generation ──────────────────────── */

const CORRELATION_SYSTEM = `You are AXE Multi-Correlation Engine — an AI analyst that finds MULTIPLE cross-feed correlations in alternative data for traders.

You receive a snapshot of 10 intelligence feeds. Your job is to find 3-5 distinct cross-feed correlations, each connecting data points across 2+ different feeds.

For each correlation, provide:
- title: short descriptive title (max 60 chars)
- summary: 2-3 sentence analysis
- confidence: high | medium | low
- signal: BULLISH | BEARISH | NEUTRAL | null
- feedsUsed: array of feed names
- symbols: array of relevant ticker symbols
- supporting: array of {feed, signal} objects with specific data points

Also provide historicalMatches: array of {title, date, similarity} where you identify if current patterns resemble past events.

Respond in EXACTLY this JSON format (no markdown, no code fences):
{
  "correlations": [
    {
      "id": "corr-1",
      "title": "...",
      "summary": "...",
      "confidence": "high",
      "signal": "BULLISH",
      "feedsUsed": ["insiderTrades", "darkPool"],
      "symbols": ["AAPL", "MSFT"],
      "supporting": [
        { "feed": "Insider Flow", "signal": "CEO bought $2M shares" },
        { "feed": "Dark Pool", "signal": "$50M block trade at ask" }
      ]
    }
  ],
  "historicalMatches": [
    { "title": "Similar pattern in March 2024", "date": "2024-03-15", "similarity": "strong" }
  ]
}

Feed names: insiderTrades, senateTrades, darkPool, unusualOptions, marketTide, corporateJets, vesselTracking, conflictEvents, energyFlows, cyberThreats

If there isn't enough data for 3 correlations, find as many as you can. Set confidence to "low" if data is sparse.`;

async function generateCorrelationSnapshot(
  intel: Awaited<ReturnType<typeof loadIntelSnapshot>>,
): Promise<CorrelationSnapshot> {
  const context = buildIntelContext(intel);

  const messages: LLMMessage[] = [
    { role: "system", content: CORRELATION_SYSTEM },
    {
      role: "user",
      content: `Analyze this intel snapshot and find 3-5 cross-feed correlations:\n\n${context}`,
    },
  ];

  const result = await callLLM({
    messages,
    temperature: 0.6,
    max_tokens: 4000,
  });

  if (!result.content) throw new Error("Empty LLM response");

  const cleaned = result.content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const parsed = JSON.parse(cleaned) as {
    correlations: Array<{
      id?: string;
      title: string;
      summary: string;
      confidence: string;
      signal: string | null;
      feedsUsed: string[];
      symbols: string[];
      supporting: FeedSignal[];
    }>;
    historicalMatches: HistoricalMatch[];
  };

  return {
    correlations: (parsed.correlations ?? []).map((c, i) => ({
      id: String(c.id ?? `corr-${i + 1}`),
      title: String(c.title ?? "").slice(0, 100),
      summary: String(c.summary ?? "").slice(0, 2000),
      confidence: (["high", "medium", "low"].includes(c.confidence) ? c.confidence : "medium") as "high" | "medium" | "low",
      signal: c.signal ? String(c.signal).toUpperCase() as "BULLISH" | "BEARISH" | "NEUTRAL" : null,
      feedsUsed: Array.isArray(c.feedsUsed) ? c.feedsUsed.map(String) : [],
      symbols: Array.isArray(c.symbols) ? c.symbols.map(String) : [],
      supporting: Array.isArray(c.supporting)
        ? c.supporting.map((s) => ({ feed: String(s.feed), signal: String(s.signal) }))
        : [],
    })),
    historicalMatches: (parsed.historicalMatches ?? []).map((h) => ({
      title: String(h.title ?? "").slice(0, 200),
      date: String(h.date ?? "").slice(0, 50),
      similarity: (["strong", "moderate"].includes(h.similarity) ? h.similarity : "moderate") as "strong" | "moderate",
    })),
    generatedAt: new Date().toISOString(),
  };
}
