import { createServerSupabaseClient } from "@/lib/supabase/server";
import { loadIntelSnapshot } from "@/lib/intel/intelClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/intel-correlations
 *
 * AXE Correlation Engine — finds MULTIPLE cross-feed correlations,
 * checks historical patterns for déjà-vu matches, and returns
 * both current correlations + historical context.
 *
 * Cached for 30 min to avoid GPT-4o abuse.
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

export async function POST() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return jsonResponse({ ok: false, error: "supabase_not_configured" }, 503);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonResponse({ ok: false, error: "unauthorized" }, 401);

  // Check cache
  const { data: cached } = await supabase
    .from("axe_correlation_snapshots")
    .select("id,correlations,historical_matches,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (cached) {
    const age = Date.now() - new Date(cached.created_at as string).getTime();
    if (age < CACHE_TTL_MS) {
      return jsonResponse({
        ok: true,
        cached: true,
        snapshot: {
          correlations: cached.correlations,
          historicalMatches: cached.historical_matches ?? [],
          generatedAt: cached.created_at,
        },
      });
    }
  }

  // Load intel
  const intel = await loadIntelSnapshot();

  const openaiKey = process.env.OPENAI_API_KEY ?? process.env.OPEN_AI_API_KEY;
  if (!openaiKey) return jsonResponse({ ok: false, error: "OPENAI_API_KEY not configured" }, 503);

  // Load past correlations for historical matching
  const { data: history } = await supabase
    .from("intel_correlations")
    .select("title,summary,feeds_used,symbols,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  try {
    const result = await generateCorrelations(openaiKey, intel, history ?? []);

    // Persist snapshot
    try {
      await supabase.from("axe_correlation_snapshots").insert({
        user_id: user.id,
        correlations: result.correlations,
        historical_matches: result.historicalMatches,
      });
    } catch {
      /* best effort */
    }

    // Also save individual correlations for future historical matching
    try {
      for (const c of result.correlations) {
        await supabase.from("intel_correlations").insert({
          user_id: user.id,
          title: c.title,
          summary: c.summary,
          confidence: c.confidence,
          signal: c.signal,
          feeds_used: c.feedsUsed,
          symbols: c.symbols,
          data_points: { supporting: c.supporting },
        });
      }
    } catch {
      /* best effort */
    }

    return jsonResponse({ ok: true, cached: false, snapshot: result });
  } catch (e) {
    return jsonResponse(
      { ok: false, error: e instanceof Error ? e.message : "Correlation analysis failed" },
      500,
    );
  }
}

/* ── Build intel context ──────────────────────────────────────────── */

function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return "?";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1)}K`;
  return `${sign}${abs.toFixed(0)}`;
}

function buildContext(intel: Awaited<ReturnType<typeof loadIntelSnapshot>>): string {
  const parts: string[] = [];

  if (intel.insiders.length > 0) {
    parts.push(`## INSIDER TRANSACTIONS (${intel.insiders.length})`);
    for (const t of intel.insiders.slice(0, 12))
      parts.push(`- ${t.ticker}: ${t.insider} ${t.type} $${formatCompact(t.value)} (${t.date})`);
  }
  if (intel.senate.length > 0) {
    parts.push(`\n## CONGRESSIONAL TRADES (${intel.senate.length})`);
    for (const t of intel.senate.slice(0, 8))
      parts.push(`- ${t.ticker}: ${t.politician} ${t.direction} ${t.size} (${t.date})`);
  }
  if (intel.darkPool.length > 0) {
    parts.push(`\n## DARK POOL (${intel.darkPool.length})`);
    for (const p of intel.darkPool.slice(0, 8))
      parts.push(`- ${p.symbol}: $${p.price.toFixed(2)} × ${p.size.toLocaleString()} $${formatCompact(p.notional)}`);
  }
  if (intel.options.length > 0) {
    parts.push(`\n## UNUSUAL OPTIONS (${intel.options.length})`);
    for (const o of intel.options.slice(0, 8))
      parts.push(`- ${o.symbol}: $${o.strike} ${o.side} exp ${o.exp} $${formatCompact(o.premium)}${o.sweep ? " SWEEP" : ""}`);
  }
  if (intel.tide) {
    parts.push(`\n## MARKET TIDE`);
    parts.push(`- Call: $${formatCompact(intel.tide.netCallPremium)}, Put: $${formatCompact(intel.tide.netPutPremium)}, Bias: ${intel.tide.bias}`);
  }
  if (intel.jets.length > 0) {
    const airborne = intel.jets.filter((j) => !j.onGround);
    parts.push(`\n## CORPORATE JETS (${airborne.length} airborne / ${intel.jets.length})`);
    for (const j of intel.jets.slice(0, 8))
      parts.push(`- ${j.company} (${j.ticker}): ${j.onGround ? "GROUNDED" : "AIRBORNE"}`);
  }
  if (intel.vessels.length > 0) {
    parts.push(`\n## VESSELS (${intel.vessels.length})`);
    for (const v of intel.vessels.slice(0, 8))
      parts.push(`- ${v.vesselName}: ${v.vesselType} — ${v.owner} | ${v.nearChokepoint ? `near ${v.nearChokepoint}` : v.destination || "?"}`);
  }
  if (intel.chokepoints.length > 0) {
    parts.push(`\n## CHOKEPOINTS (${intel.chokepoints.length})`);
    for (const c of intel.chokepoints)
      parts.push(`- ${c.name}: risk ${c.riskLevel} — ${c.dailyShipCount} ships/day`);
  }
  if (intel.conflicts.length > 0) {
    parts.push(`\n## SEISMIC EVENTS (${intel.conflicts.length})`);
    for (const c of intel.conflicts.slice(0, 8))
      parts.push(`- ${c.country}: ${c.eventType} — ${c.notes.slice(0, 100)}`);
  }
  if (intel.energy.length > 0) {
    parts.push(`\n## ENERGY (${intel.energy.length})`);
    const seen = new Set<string>();
    for (const e of intel.energy) {
      if (seen.has(e.seriesId)) continue;
      seen.add(e.seriesId);
      parts.push(`- ${e.seriesName}: ${e.value != null ? e.value.toFixed(2) : "?"} ${e.unit}`);
    }
  }
  if (intel.cyber.length > 0) {
    parts.push(`\n## CYBER (${intel.cyber.length})`);
    for (const t of intel.cyber.slice(0, 6))
      parts.push(`- ${t.ip}: ${t.classification} — ${t.name || t.category}`);
  }
  if (intel.military.length > 0) {
    const byType = new Map<string, number>();
    for (const m of intel.military) byType.set(m.category, (byType.get(m.category) ?? 0) + 1);
    parts.push(`\n## MILITARY RADAR (${intel.military.length})`);
    for (const [cat, n] of byType) parts.push(`- ${cat}: ${n} aircraft`);
  }
  if (intel.emergency.length > 0) {
    parts.push(`\n## EMERGENCY SQUAWKS (${intel.emergency.length})`);
    for (const e of intel.emergency)
      parts.push(`- ${e.callsign || e.hex}: squawk ${e.squawk}`);
  }

  return parts.join("\n");
}

/* ── GPT-4o multi-correlation generator ───────────────────────────── */

type HistoryRow = {
  title: string;
  summary: string;
  feeds_used: unknown;
  symbols: unknown;
  created_at: string;
};

async function generateCorrelations(
  apiKey: string,
  intel: Awaited<ReturnType<typeof loadIntelSnapshot>>,
  history: HistoryRow[],
): Promise<CorrelationSnapshot> {
  const context = buildContext(intel);

  const historyContext =
    history.length > 0
      ? `\n\n## HISTORICAL CORRELATIONS (past analyses)\n${history
          .slice(0, 10)
          .map(
            (h) =>
              `- [${new Date(h.created_at).toLocaleDateString("en-GB")}] ${h.title}: ${h.summary.slice(0, 100)}`,
          )
          .join("\n")}`
      : "";

  const systemPrompt = `You are AXE CORRELATION ENGINE — the pattern-detection core of AXE Companion OS.

You receive 13 intelligence feeds and historical correlation analyses. Your job:

1. Find 3-5 DISTINCT cross-feed correlations — patterns connecting data from 2+ different feeds
2. Check if any current patterns match historical ones (déjà-vu detection)

Each correlation MUST connect different feeds (e.g., insider + options, military + energy + chokepoints).

Examples of strong correlations:
- Military radar activity ↑ + oil tanker rerouting + Hormuz chokepoint risk ↑ = energy supply disruption thesis
- Insider buying in defense + congressional defense stock trades + conflict events = defense sector catalyst
- Dark pool accumulation in tech + CEO jets departing to Asia + semiconductor chokepoint risk = supply chain signal
- Cyber attacks on energy infrastructure + energy flow disruption + emergency squawks near facilities = black swan risk

Respond in EXACTLY this JSON (no markdown fences):
{
  "correlations": [
    {
      "title": "Short pattern name (max 50 chars)",
      "summary": "2-3 sentences: what feeds connect, what it implies for trading, how confident you are.",
      "confidence": "high" | "medium" | "low",
      "signal": "BULLISH" | "BEARISH" | "NEUTRAL" | null,
      "feedsUsed": ["Insider Flow", "Options Flow", ...],
      "symbols": ["XAUUSD", "CL", ...],
      "supporting": [
        { "feed": "Insider Flow", "signal": "3 gold miner insiders bought $2.1M in last 48h" }
      ]
    }
  ],
  "historicalMatches": [
    {
      "title": "Pattern name from history",
      "date": "DD/MM/YYYY",
      "similarity": "strong" | "moderate"
    }
  ]
}

RULES:
- Return 3-5 correlations, ranked by strength (strongest first)
- Each must use 2+ different feed categories
- Be specific: cite actual data points, not vague statements
- historicalMatches: compare current patterns to the historical correlations. If a similar pattern appeared before, include it. Empty array if no matches.
- Feed names: Insider Flow, Congressional Trades, Dark Pool, Options Flow, Market Tide, Corporate Jets, Vessel Intel, Chokepoints, Seismic Events, Energy Flow, Cyber Intel, Military Radar, Emergency Monitor`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Current: ${new Date().toISOString()}\n\n${context}${historyContext}`,
        },
      ],
      temperature: 0.5,
      max_tokens: 3000,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`OpenAI ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("Empty GPT-4o response");

  const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const parsed = JSON.parse(cleaned) as {
    correlations: Correlation[];
    historicalMatches: HistoricalMatch[];
  };

  return {
    generatedAt: new Date().toISOString(),
    correlations: (parsed.correlations ?? []).map((c, i) => ({
      id: `corr-${Date.now()}-${i}`,
      title: String(c.title ?? "Pattern").slice(0, 80),
      summary: String(c.summary ?? "").slice(0, 500),
      confidence: (["high", "medium", "low"].includes(c.confidence) ? c.confidence : "medium") as
        | "high"
        | "medium"
        | "low",
      signal: c.signal ? (String(c.signal).toUpperCase() as "BULLISH" | "BEARISH" | "NEUTRAL") : null,
      feedsUsed: Array.isArray(c.feedsUsed) ? c.feedsUsed.map(String) : [],
      symbols: Array.isArray(c.symbols) ? c.symbols.map(String) : [],
      supporting: Array.isArray(c.supporting)
        ? c.supporting.map((s) => ({ feed: String(s.feed), signal: String(s.signal) }))
        : [],
    })),
    historicalMatches: (parsed.historicalMatches ?? []).map((h) => ({
      title: String(h.title ?? ""),
      date: String(h.date ?? ""),
      similarity: h.similarity === "strong" ? "strong" : "moderate",
    })),
  };
}
