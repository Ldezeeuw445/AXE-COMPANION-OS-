import { createServerSupabaseClient } from "@/lib/supabase/server";
import { loadIntelSnapshot } from "@/lib/intel/intelClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/intel-conviction
 *
 * AXE Conviction Engine — analyses all intel feeds and produces a market
 * conviction per key asset class (Gold, Oil, Nasdaq, USD, etc.)
 * Each conviction has a direction, confidence %, and reasoning chain
 * showing which feeds support or contradict the thesis.
 *
 * Caches to Supabase `axe_convictions` so it doesn't re-run GPT-4o
 * on every page load. Only regenerates if >30 min stale.
 */

type AssetConviction = {
  asset: string;
  ticker: string;
  direction: "Bullish" | "Bearish" | "Neutral";
  confidence: number; // 0-100
  reasoning: string;
  supporting: { feed: string; signal: string }[];
  contradicting: { feed: string; signal: string }[];
};

type ConvictionSnapshot = {
  id: string;
  generatedAt: string;
  convictions: AssetConviction[];
  marketSentence: string; // One-line overall market read
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/* ── Cache check ──────────────────────────────────────────────────── */

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min

async function getCachedConviction(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string,
): Promise<ConvictionSnapshot | null> {
  if (!supabase) return null;
  const { data } = await supabase
    .from("axe_convictions")
    .select("id,convictions,market_sentence,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!data) return null;
  const age = Date.now() - new Date(data.created_at as string).getTime();
  if (age > CACHE_TTL_MS) return null;

  return {
    id: data.id as string,
    generatedAt: data.created_at as string,
    convictions: data.convictions as AssetConviction[],
    marketSentence: (data.market_sentence as string) ?? "",
  };
}

/* ── POST handler ─────────────────────────────────────────────────── */

export async function POST() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return jsonResponse({ ok: false, error: "supabase_not_configured" }, 503);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonResponse({ ok: false, error: "unauthorized" }, 401);

  // Return cached if fresh
  const cached = await getCachedConviction(supabase, user.id);
  if (cached) return jsonResponse({ ok: true, cached: true, conviction: cached });

  // Load intel snapshot
  const intel = await loadIntelSnapshot();

  const openaiKey = process.env.OPENAI_API_KEY ?? process.env.OPEN_AI_API_KEY;
  if (!openaiKey) return jsonResponse({ ok: false, error: "OPENAI_API_KEY not configured" }, 503);

  try {
    const result = await generateConvictions(openaiKey, intel);

    // Persist
    try {
      await supabase.from("axe_convictions").insert({
        user_id: user.id,
        convictions: result.convictions,
        market_sentence: result.marketSentence,
        feed_snapshot: buildFeedSummary(intel),
      });
    } catch {
      /* best effort */
    }

    return jsonResponse({ ok: true, cached: false, conviction: result });
  } catch (e) {
    return jsonResponse(
      { ok: false, error: e instanceof Error ? e.message : "Conviction generation failed" },
      500,
    );
  }
}

/* ── GET handler — returns cached only ────────────────────────────── */

export async function GET() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return jsonResponse({ ok: false, error: "supabase_not_configured" }, 503);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonResponse({ ok: false, error: "unauthorized" }, 401);

  const { data } = await supabase
    .from("axe_convictions")
    .select("id,convictions,market_sentence,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!data) return jsonResponse({ ok: true, conviction: null });

  const age = Date.now() - new Date(data.created_at as string).getTime();
  return jsonResponse({
    ok: true,
    stale: age > CACHE_TTL_MS,
    conviction: {
      id: data.id,
      generatedAt: data.created_at,
      convictions: data.convictions,
      marketSentence: data.market_sentence ?? "",
    },
  });
}

/* ── Build intel context for GPT ──────────────────────────────────── */

function buildFeedSummary(intel: Awaited<ReturnType<typeof loadIntelSnapshot>>): Record<string, number> {
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
    military: intel.military.length,
    emergency: intel.emergency.length,
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

function buildIntelContext(intel: Awaited<ReturnType<typeof loadIntelSnapshot>>): string {
  const parts: string[] = [];

  if (intel.insiders.length > 0) {
    parts.push(`## INSIDER TRANSACTIONS (${intel.insiders.length})`);
    for (const t of intel.insiders.slice(0, 12)) {
      parts.push(`- ${t.ticker}: ${t.insider} ${t.type} $${formatCompact(t.value)} (${t.date})`);
    }
  }

  if (intel.senate.length > 0) {
    parts.push(`\n## CONGRESSIONAL TRADES (${intel.senate.length})`);
    for (const t of intel.senate.slice(0, 8)) {
      parts.push(`- ${t.ticker}: ${t.politician} ${t.direction} ${t.size} (${t.date})`);
    }
  }

  if (intel.darkPool.length > 0) {
    parts.push(`\n## DARK POOL (${intel.darkPool.length})`);
    for (const p of intel.darkPool.slice(0, 8)) {
      parts.push(`- ${p.symbol}: $${p.price.toFixed(2)} × ${p.size.toLocaleString()} $${formatCompact(p.notional)}${p.side ? ` (${p.side})` : ""}`);
    }
  }

  if (intel.options.length > 0) {
    parts.push(`\n## UNUSUAL OPTIONS (${intel.options.length})`);
    for (const o of intel.options.slice(0, 8)) {
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
    for (const j of intel.jets.slice(0, 8)) {
      parts.push(`- ${j.company} (${j.ticker}): ${j.onGround ? "GROUNDED" : `AIRBORNE alt ${j.altitude ? Math.round(j.altitude) + "ft" : "?"}`} — ${j.callsign || j.icao24}`);
    }
  }

  if (intel.vessels.length > 0) {
    parts.push(`\n## VESSEL TRACKING (${intel.vessels.length})`);
    for (const v of intel.vessels.slice(0, 8)) {
      parts.push(`- ${v.vesselName}: ${v.vesselType} — ${v.owner} | ${v.nearChokepoint ? `near ${v.nearChokepoint}` : v.destination || "?"} | alert: ${v.alertLevel}`);
    }
  }

  if (intel.chokepoints.length > 0) {
    parts.push(`\n## CHOKEPOINTS (${intel.chokepoints.length})`);
    for (const c of intel.chokepoints) {
      parts.push(`- ${c.name} (${c.region}): risk ${c.riskLevel} — ${c.dailyShipCount} ships/day, ${c.percentageGlobalTrade}% global trade — ${c.riskFactors.slice(0, 100)}`);
    }
  }

  if (intel.conflicts.length > 0) {
    parts.push(`\n## SEISMIC EVENTS (${intel.conflicts.length})`);
    for (const c of intel.conflicts.slice(0, 8)) {
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
    for (const t of intel.cyber.slice(0, 6)) {
      parts.push(`- ${t.ip}: ${t.classification} — ${t.name || t.category}${t.tags.length > 0 ? ` [${t.tags.join(", ")}]` : ""}`);
    }
  }

  if (intel.military.length > 0) {
    const byType = new Map<string, number>();
    for (const m of intel.military) {
      byType.set(m.category, (byType.get(m.category) ?? 0) + 1);
    }
    parts.push(`\n## MILITARY RADAR (${intel.military.length} aircraft)`);
    for (const [cat, count] of byType.entries()) {
      parts.push(`- ${cat}: ${count} aircraft`);
    }
  }

  if (intel.emergency.length > 0) {
    parts.push(`\n## EMERGENCY SQUAWKS (${intel.emergency.length})`);
    for (const e of intel.emergency) {
      parts.push(`- ${e.callsign || e.hex}: squawk ${e.squawk} — alt ${e.altitude ?? "?"}ft`);
    }
  } else {
    parts.push(`\n## EMERGENCY MONITOR: ALL CLEAR — no active squawk 7700 emergencies`);
  }

  return parts.join("\n");
}

/* ── GPT-4o Conviction Generation ─────────────────────────────────── */

const CONVICTION_SYSTEM = `You are AXE CONVICTION ENGINE — the intelligence analysis core of AXE Companion OS, a professional trading terminal.

You receive a full snapshot of 13 alternative data feeds. Your job is to synthesize ALL feeds into clear market convictions for key asset classes that traders actively trade.

Analyze the data and return EXACTLY this JSON structure (no markdown, no code fences):

{
  "marketSentence": "One powerful sentence summarizing the overall market read right now.",
  "convictions": [
    {
      "asset": "Gold",
      "ticker": "XAUUSD",
      "direction": "Bullish" | "Bearish" | "Neutral",
      "confidence": <number 0-100>,
      "reasoning": "2-3 sentences explaining the thesis based on the data.",
      "supporting": [
        { "feed": "Insider Flow", "signal": "Heavy insider buying in gold miners GDX, NEM" },
        { "feed": "Energy Flow", "signal": "Oil prices rising, inflation hedge thesis intact" }
      ],
      "contradicting": [
        { "feed": "Options Flow", "signal": "Large put spreads on GLD expiring next week" }
      ]
    }
  ]
}

RULES:
- Always include these assets (in order): Gold (XAUUSD), Oil (WTI/CL), Nasdaq (NQ/QQQ), S&P 500 (ES/SPY), USD (DXY), EUR/USD (EURUSD), Bitcoin (BTC)
- Add 1-3 more if the data strongly suggests conviction (e.g., specific stocks with heavy insider activity)
- confidence must be evidence-based: 50-60 = slight lean, 60-75 = moderate conviction, 75-90 = strong evidence, 90+ = overwhelming
- If a feed has no data, don't fabricate signals from it
- supporting and contradicting: use human-readable feed names (Insider Flow, Options Flow, Dark Pool, Congressional Trades, Market Tide, Corporate Jets, Vessel Intel, Chokepoints, Seismic Events, Energy Flow, Cyber Intel, Military Radar, Emergency Monitor)
- Be specific: cite actual data points, not generic statements
- If data is sparse for an asset, confidence should be low (50-60) and direction Neutral
- marketSentence should be punchy, trader-style, max 120 chars`;

async function generateConvictions(
  apiKey: string,
  intel: Awaited<ReturnType<typeof loadIntelSnapshot>>,
): Promise<ConvictionSnapshot> {
  const context = buildIntelContext(intel);

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: CONVICTION_SYSTEM },
        {
          role: "user",
          content: `Current timestamp: ${new Date().toISOString()}\n\nFull AXE Intel Snapshot:\n\n${context}`,
        },
      ],
      temperature: 0.4,
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
    marketSentence: string;
    convictions: AssetConviction[];
  };

  return {
    id: `conv-${Date.now()}`,
    generatedAt: new Date().toISOString(),
    marketSentence: String(parsed.marketSentence ?? "").slice(0, 200),
    convictions: (parsed.convictions ?? []).map((c) => ({
      asset: String(c.asset),
      ticker: String(c.ticker),
      direction: (["Bullish", "Bearish", "Neutral"].includes(c.direction)
        ? c.direction
        : "Neutral") as "Bullish" | "Bearish" | "Neutral",
      confidence: Math.max(0, Math.min(100, Math.round(Number(c.confidence) || 50))),
      reasoning: String(c.reasoning ?? "").slice(0, 500),
      supporting: Array.isArray(c.supporting)
        ? c.supporting.map((s) => ({ feed: String(s.feed), signal: String(s.signal) }))
        : [],
      contradicting: Array.isArray(c.contradicting)
        ? c.contradicting.map((s) => ({ feed: String(s.feed), signal: String(s.signal) }))
        : [],
    })),
  };
}
