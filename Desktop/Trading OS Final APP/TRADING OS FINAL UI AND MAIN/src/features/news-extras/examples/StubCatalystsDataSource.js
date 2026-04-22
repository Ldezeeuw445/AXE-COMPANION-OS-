/**
 * StubCatalystsDataSource
 *
 * Demo implementation of CatalystsDataSource. Replace with real adapter
 * backed by FMP (earnings calendar), FRED (macro releases), or your own
 * curated Supabase table. Contract matches types.d.ts.
 */

const HOUR = 1000 * 60 * 60;

function buildCatalysts(now = Date.now()) {
  return [
    {
      id: "cat_1",
      kind: "fed",
      title: "FOMC rate decision",
      detail: "Statement + SEP dot plot, press conference 30m later",
      at: now + HOUR * 1.25,
      importance: "high",
      symbols: ["SPY", "QQQ", "TLT", "DXY"],
    },
    {
      id: "cat_2",
      kind: "earnings",
      title: "NVDA earnings (AMC)",
      detail: "Q3 FY26, consensus EPS 5.58, rev 33.0B",
      at: now + HOUR * 1.75,
      importance: "high",
      symbols: ["NVDA", "SMH", "AMD", "AVGO"],
    },
    {
      id: "cat_3",
      kind: "earnings",
      title: "TSLA earnings (AMC)",
      detail: "Q1 delivery follow-up + margin guide",
      at: now + HOUR * 4,
      importance: "medium",
      symbols: ["TSLA"],
    },
    {
      id: "cat_4",
      kind: "economic",
      title: "US Crude Oil Inventories",
      detail: "EIA weekly, consensus -1.2M bbl",
      at: now + HOUR * 6,
      importance: "low",
      symbols: ["USO", "XOM", "CVX"],
    },
    {
      id: "cat_5",
      kind: "economic",
      title: "Core PCE (YoY)",
      detail: "Fed's preferred inflation gauge, consensus 2.6%",
      at: now + HOUR * 18,
      importance: "high",
      symbols: ["SPY", "TLT", "DXY", "GLD"],
    },
    {
      id: "cat_6",
      kind: "earnings",
      title: "AAPL earnings (AMC)",
      detail: "iPhone units + services guide in focus",
      at: now + HOUR * 22,
      importance: "high",
      symbols: ["AAPL", "QQQ"],
    },
    {
      id: "cat_7",
      kind: "fed",
      title: "Powell speech — Jackson Hole panel",
      detail: "Prepared remarks then Q&A",
      at: now + HOUR * 27,
      importance: "medium",
      symbols: ["SPY", "DXY"],
    },
    {
      id: "cat_8",
      kind: "economic",
      title: "Non-Farm Payrolls",
      detail: "Consensus +175k, unemployment 4.1%",
      at: now + HOUR * 34,
      importance: "high",
      symbols: ["SPY", "TLT", "DXY"],
    },
    {
      id: "cat_9",
      kind: "earnings",
      title: "MSFT earnings (AMC)",
      detail: "Azure growth rate + AI capex color",
      at: now + HOUR * 39,
      importance: "high",
      symbols: ["MSFT", "QQQ"],
    },
    {
      id: "cat_10",
      kind: "macro",
      title: "ECB rate decision",
      detail: "Lagarde presser 45m after release",
      at: now + HOUR * 42,
      importance: "medium",
      symbols: ["FXE", "EURUSD", "DXY"],
    },
    {
      id: "cat_11",
      kind: "earnings",
      title: "META earnings (AMC)",
      detail: "Reality Labs burn + Reels monetization",
      at: now + HOUR * 45,
      importance: "medium",
      symbols: ["META"],
    },
    {
      id: "cat_12",
      kind: "other",
      title: "US Treasury 10Y auction",
      detail: "$39B reopening, watch bid-to-cover + tail",
      at: now + HOUR * 47,
      importance: "low",
      symbols: ["TLT", "IEF"],
    },
  ];
}

export function createStubCatalystsDataSource({ latencyMs = 120 } = {}) {
  return {
    async listUpcoming(windowHours = 48) {
      const now = Date.now();
      const cutoff = now + windowHours * HOUR;
      const list = buildCatalysts(now).filter((c) => c.at <= cutoff);
      return new Promise((resolve) =>
        setTimeout(() => resolve(list), latencyMs)
      );
    },
  };
}

export default createStubCatalystsDataSource;
