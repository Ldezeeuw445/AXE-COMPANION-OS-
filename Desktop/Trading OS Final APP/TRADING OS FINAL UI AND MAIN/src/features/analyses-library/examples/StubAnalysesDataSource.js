/**
 * StubAnalysesDataSource
 *
 * Demo AnalysesDataSource. Replace with Supabase + FMP + FRED adapter.
 *   - listAnalyses    -> Supabase `analyses` table
 *   - getTodaysThesis -> Supabase `theses` (pinned=true, today)
 *   - listCalendar    -> FMP earnings + FRED macro + curated fed calendar
 *
 * Contract in ../src/features/analyses-library/types.d.ts
 */

const HOUR = 1000 * 60 * 60;
const DAY = HOUR * 24;

function mkSpark(seed, up = true) {
  const out = [];
  let x = seed;
  let v = 100;
  for (let i = 0; i < 22; i += 1) {
    x = (x * 9301 + 49297) % 233280;
    const step = (x / 233280 - 0.5) * 4 + (up ? 0.4 : -0.4);
    v = Math.max(10, v + step);
    out.push(v);
  }
  return out;
}

function buildAnalyses(now = Date.now()) {
  return [
    {
      id: "an_01",
      title: "NVDA — Long into earnings",
      summary: "Supply constraint easing + hyperscaler capex re-accel. Entry on 9/21 EMA reclaim.",
      tags: ["Stocks", "Tech"],
      symbols: ["NVDA", "SMH", "AVGO"],
      bias: "long",
      status: "live",
      updatedAt: now - HOUR * 2,
      createdAt: now - DAY * 3,
      author: "LDZ",
      entry: 108,
      target: 135,
      stop: 102,
      pnlPct: 5.8,
      conviction: 4,
      sparkline: mkSpark(1, true),
      linkedEventIds: ["ev_nvda_earnings", "ev_pce"],
    },
    {
      id: "an_02",
      title: "EURUSD — Short on ECB divergence",
      summary: "Lagarde dovish vs hawkish Fed path. Swing entry 1.0850, target 1.0650.",
      tags: ["FX", "Macro"],
      symbols: ["EURUSD", "DXY", "FXE"],
      bias: "short",
      status: "live",
      updatedAt: now - HOUR * 5,
      createdAt: now - DAY * 2,
      entry: 1.085,
      target: 1.065,
      stop: 1.095,
      pnlPct: -0.4,
      conviction: 3,
      sparkline: mkSpark(2, false),
      linkedEventIds: ["ev_ecb", "ev_pce"],
    },
    {
      id: "an_03",
      title: "Crude — Mean reversion long",
      summary: "OPEC+ compliance rumor + draw in API. Target 50d MA reclaim.",
      tags: ["Commodities", "Energy"],
      symbols: ["CL", "USO", "XOM"],
      bias: "long",
      status: "live",
      updatedAt: now - HOUR * 1,
      createdAt: now - DAY * 1,
      pnlPct: 1.8,
      conviction: 2,
      sparkline: mkSpark(3, true),
      linkedEventIds: ["ev_eia"],
    },
    {
      id: "an_04",
      title: "SPY — Short into FOMC",
      summary: "Vol risk premium + positioning long. Hedge via Apr 570/560 put spread.",
      tags: ["Stocks", "Macro", "Rates"],
      symbols: ["SPY", "ES"],
      bias: "short",
      status: "live",
      updatedAt: now - HOUR * 8,
      createdAt: now - DAY * 2,
      pnlPct: 0.2,
      conviction: 3,
      sparkline: mkSpark(4, false),
      linkedEventIds: ["ev_fomc"],
    },
    {
      id: "an_05",
      title: "BTC — Long dips toward 200d",
      summary: "ETF flows stabilizing + MVRV reset. Accumulate 56k-58k, invalidation below 54k.",
      tags: ["Crypto"],
      symbols: ["BTC"],
      bias: "long",
      status: "draft",
      updatedAt: now - HOUR * 18,
      createdAt: now - DAY * 4,
      conviction: 3,
      sparkline: mkSpark(5, true),
      linkedEventIds: [],
    },
    {
      id: "an_06",
      title: "TLT — Long into PCE",
      summary: "Positioning stretched short. Below-consensus PCE print unlocks duration bid.",
      tags: ["Rates", "Macro"],
      symbols: ["TLT", "ZB", "IEF"],
      bias: "long",
      status: "live",
      updatedAt: now - HOUR * 3,
      createdAt: now - DAY * 1,
      pnlPct: 2.1,
      conviction: 4,
      sparkline: mkSpark(6, true),
      linkedEventIds: ["ev_pce", "ev_nfp"],
    },
    {
      id: "an_07",
      title: "GLD — Momentum continuation",
      summary: "Real yields rolling + central bank bid sticky. Trail stop under 20d EMA.",
      tags: ["Commodities", "Macro"],
      symbols: ["GLD", "GC"],
      bias: "long",
      status: "live",
      updatedAt: now - HOUR * 12,
      createdAt: now - DAY * 5,
      pnlPct: 8.4,
      conviction: 4,
      sparkline: mkSpark(7, true),
    },
    {
      id: "an_08",
      title: "AAPL — Short post-earnings IV crush",
      summary: "Services decel + China headwinds. Sell Apr 220 calls, cover on guide-beat.",
      tags: ["Stocks", "Tech"],
      symbols: ["AAPL"],
      bias: "short",
      status: "live",
      updatedAt: now - HOUR * 6,
      createdAt: now - DAY * 1,
      pnlPct: -1.2,
      conviction: 2,
      sparkline: mkSpark(8, false),
      linkedEventIds: ["ev_aapl_earnings"],
    },
    {
      id: "an_09",
      title: "USDJPY — Intervention watch",
      summary: "BOJ verbal warnings escalating. 158 = realistic intervention zone.",
      tags: ["FX"],
      symbols: ["USDJPY"],
      bias: "neutral",
      status: "draft",
      updatedAt: now - DAY * 1,
      createdAt: now - DAY * 3,
      conviction: 2,
      sparkline: mkSpark(9, false),
    },
    {
      id: "an_10",
      title: "TSLA — Post-delivery short squeeze",
      summary: "Q1 delivery beat, shorts covering. Scalp to 290, exit into earnings.",
      tags: ["Stocks", "Tech"],
      symbols: ["TSLA"],
      bias: "long",
      status: "hit_target",
      updatedAt: now - DAY * 1,
      createdAt: now - DAY * 6,
      pnlPct: 12.4,
      conviction: 3,
      sparkline: mkSpark(10, true),
      linkedEventIds: ["ev_tsla_earnings"],
    },
    {
      id: "an_11",
      title: "XLE vs XLK pair — mean reversion",
      summary: "Long XLE / short XLK. Ratio at 2-sigma stretch, energy oversold vs tech.",
      tags: ["Stocks", "Energy", "Tech"],
      symbols: ["XLE", "XLK"],
      bias: "long",
      status: "live",
      updatedAt: now - HOUR * 9,
      createdAt: now - DAY * 2,
      pnlPct: 0.8,
      conviction: 3,
      sparkline: mkSpark(11, true),
    },
    {
      id: "an_12",
      title: "Copper — Breakout watch",
      summary: "Inventories at decade lows + grid capex. Long HG above 4.30, target 4.80.",
      tags: ["Commodities"],
      symbols: ["HG", "FCX"],
      bias: "long",
      status: "draft",
      updatedAt: now - DAY * 2,
      createdAt: now - DAY * 7,
      conviction: 3,
      sparkline: mkSpark(12, true),
    },
    {
      id: "an_13",
      title: "NFLX — Short after rip",
      summary: "Overextended 50% off lows, ad-tier saturating. Fade into resistance.",
      tags: ["Stocks", "Tech"],
      symbols: ["NFLX"],
      bias: "short",
      status: "stopped",
      updatedAt: now - DAY * 2,
      createdAt: now - DAY * 8,
      pnlPct: -3.2,
      conviction: 2,
      sparkline: mkSpark(13, false),
    },
    {
      id: "an_14",
      title: "ETHBTC — Long ratio",
      summary: "ETF narrative + L2 activity. Accumulate 0.053, target 0.060.",
      tags: ["Crypto"],
      symbols: ["ETHBTC"],
      bias: "long",
      status: "live",
      updatedAt: now - HOUR * 4,
      createdAt: now - DAY * 2,
      pnlPct: 2.8,
      conviction: 3,
      sparkline: mkSpark(14, true),
    },
    {
      id: "an_15",
      title: "MSFT — Long AI capex beneficiary",
      summary: "Azure accel + Copilot monetization. Buy dips to 20d EMA.",
      tags: ["Stocks", "Tech"],
      symbols: ["MSFT"],
      bias: "long",
      status: "live",
      updatedAt: now - HOUR * 7,
      createdAt: now - DAY * 4,
      pnlPct: 4.6,
      conviction: 4,
      sparkline: mkSpark(15, true),
      linkedEventIds: ["ev_msft_earnings"],
    },
  ];
}

function buildEvents(now = Date.now()) {
  return [
    {
      id: "ev_fomc",
      kind: "fed",
      title: "FOMC rate decision",
      at: now + HOUR * 1.5,
      importance: "high",
      symbols: ["SPY", "TLT", "DXY"],
      linkedAnalysisIds: ["an_04", "an_06"],
    },
    {
      id: "ev_nvda_earnings",
      kind: "earnings",
      title: "NVDA earnings (AMC)",
      at: now + HOUR * 2,
      importance: "high",
      symbols: ["NVDA"],
      linkedAnalysisIds: ["an_01"],
    },
    {
      id: "ev_tsla_earnings",
      kind: "earnings",
      title: "TSLA earnings (AMC)",
      at: now + HOUR * 4,
      importance: "medium",
      symbols: ["TSLA"],
      linkedAnalysisIds: ["an_10"],
    },
    {
      id: "ev_eia",
      kind: "macro",
      title: "EIA crude inventories",
      at: now + HOUR * 6,
      importance: "low",
      symbols: ["USO"],
      linkedAnalysisIds: ["an_03"],
    },
    {
      id: "ev_pce",
      kind: "macro",
      title: "Core PCE (YoY)",
      at: now + HOUR * 18,
      importance: "high",
      symbols: ["SPY", "TLT", "DXY"],
      linkedAnalysisIds: ["an_01", "an_02", "an_06"],
    },
    {
      id: "ev_aapl_earnings",
      kind: "earnings",
      title: "AAPL earnings (AMC)",
      at: now + HOUR * 22,
      importance: "high",
      symbols: ["AAPL"],
      linkedAnalysisIds: ["an_08"],
    },
    {
      id: "ev_ecb",
      kind: "central_bank",
      title: "ECB rate decision",
      at: now + HOUR * 25,
      importance: "medium",
      symbols: ["EURUSD"],
      linkedAnalysisIds: ["an_02"],
    },
    {
      id: "ev_nfp",
      kind: "macro",
      title: "Non-Farm Payrolls",
      at: now + HOUR * 34,
      importance: "high",
      symbols: ["SPY", "TLT", "DXY"],
      linkedAnalysisIds: ["an_06"],
    },
    {
      id: "ev_msft_earnings",
      kind: "earnings",
      title: "MSFT earnings (AMC)",
      at: now + HOUR * 39,
      importance: "high",
      symbols: ["MSFT"],
      linkedAnalysisIds: ["an_15"],
    },
    {
      id: "ev_powell",
      kind: "fed",
      title: "Powell — Jackson Hole panel",
      at: now + HOUR * 48,
      importance: "medium",
      symbols: ["SPY"],
      linkedAnalysisIds: [],
    },
    {
      id: "ev_10y",
      kind: "other",
      title: "10Y Treasury auction",
      at: now + HOUR * 54,
      importance: "low",
      symbols: ["TLT"],
      linkedAnalysisIds: ["an_06"],
    },
  ];
}

export function createStubAnalysesDataSource({ latencyMs = 120 } = {}) {
  const delay = (v) =>
    new Promise((resolve) => setTimeout(() => resolve(v), latencyMs));

  return {
    async listAnalyses() {
      return delay(buildAnalyses());
    },

    async getTodaysThesis() {
      return delay({
        analysisId: "an_01",
        headline: "NVDA long into earnings — supply easing, capex re-accel",
        rationale:
          "Hyperscaler capex guides rolling higher across MSFT/GOOGL/META. NVDA supply constraints easing through back half of calendar year. Positioning still under 2023 highs — asymmetric setup into the print with IV below realized.",
        confidence: 4,
      });
    },

    async listCalendar(windowHours = 72) {
      const now = Date.now();
      const cutoff = now + windowHours * HOUR;
      return delay(buildEvents(now).filter((e) => e.at <= cutoff));
    },
  };
}

export default createStubAnalysesDataSource;
