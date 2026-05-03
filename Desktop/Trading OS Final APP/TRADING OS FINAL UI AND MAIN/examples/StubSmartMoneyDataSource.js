/**
 * StubSmartMoneyDataSource
 *
 * Demo SmartMoneyDataSource with realistic multi-channel events across
 * recent hours. Replace with real adapter that queries Supabase tables
 * populated by your Python ingestion workers:
 *
 *   - political_trades  (from Quiver / housestockwatcher / FMP senate-disclosure)
 *   - insider_trades    (from FMP /v4/insider-trading, Finnhub)
 *   - whale_tx          (from Whale Alert, Arkham, Nansen)
 *   - dark_pool_prints  (from FMP ultimate dark-pool, Unusual Whales)
 *   - options_flow      (from Unusual Whales, CBOE)
 *   - jet_landings      (from ADS-B Exchange via RapidAPI + your tail table)
 *   - vessel_events     (from MarineTraffic, Kpler)
 *
 * Each worker writes a normalized SignalEvent row to Supabase; this adapter
 * simply SELECTs the last `sinceMs` worth across all tables.
 */

const M = 1_000_000;
const H = 1000 * 60 * 60;

function buildEvents(now = Date.now()) {
  return [
    // -------------- NVDA (strongly bullish, multi-channel) --------------
    {
      id: "evt_1",
      channel: "politician",
      symbol: "NVDA",
      direction: "bullish",
      notionalUsd: 750_000,
      headline: "Nancy Pelosi: NVDA calls $500k-$1M",
      at: now - H * 2,
    },
    {
      id: "evt_2",
      channel: "options",
      symbol: "NVDA",
      direction: "bullish",
      notionalUsd: 4.2 * M,
      headline: "Unusual call sweep $900 strike Apr 25 · $4.2M premium",
      at: now - H * 1.5,
    },
    {
      id: "evt_3",
      channel: "dark_pool",
      symbol: "NVDA",
      direction: "bullish",
      notionalUsd: 689 * M,
      headline: "Dark pool print 1.76M shares · $689M notional",
      at: now - H * 4,
    },
    {
      id: "evt_4",
      channel: "jet",
      symbol: "NVDA",
      direction: "bullish",
      notionalUsd: 0,
      headline: "NVDA Gulfstream SJC → OMA · unusual destination",
      detail: "Possible enterprise deal — Omaha is Berkshire HQ region",
      at: now - H * 0.5,
    },

    // -------------- TSLA (bearish cluster) --------------
    {
      id: "evt_5",
      channel: "insider",
      symbol: "TSLA",
      direction: "bullish",
      notionalUsd: 250 * M,
      headline: "Elon Musk BUY $250M open market",
      at: now - H * 8,
    },
    {
      id: "evt_6",
      channel: "options",
      symbol: "TSLA",
      direction: "bearish",
      notionalUsd: 1.8 * M,
      headline: "Put sweep $180 strike Apr 25 · $1.8M premium",
      at: now - H * 3,
    },
    {
      id: "evt_7",
      channel: "politician",
      symbol: "TSLA",
      direction: "bearish",
      notionalUsd: 85_000,
      headline: "Ro Khanna: TSLA SELL $50k-$100k",
      at: now - H * 12,
    },
    {
      id: "evt_8",
      channel: "jet",
      symbol: "TSLA",
      direction: "neutral",
      headline: "TSLA Gulfstream AUS → DCA · regulatory meeting likely",
      at: now - H * 5,
    },

    // -------------- PLTR (bullish, politician-driven) --------------
    {
      id: "evt_9",
      channel: "politician",
      symbol: "PLTR",
      direction: "bullish",
      notionalUsd: 180_000,
      headline: "Mike Johnson BUY PLTR $100k-$250k",
      at: now - H * 24,
    },
    {
      id: "evt_10",
      channel: "options",
      symbol: "PLTR",
      direction: "bullish",
      notionalUsd: 450_000,
      headline: "Call sweep $25 strike May 2 · 15k contracts",
      at: now - H * 6,
    },

    // -------------- SPY (macro, bearish) --------------
    {
      id: "evt_11",
      channel: "dark_pool",
      symbol: "SPY",
      direction: "bearish",
      notionalUsd: 617 * M,
      headline: "Dark pool print 1.34M shares · $617M notional",
      at: now - H * 7,
    },
    {
      id: "evt_12",
      channel: "options",
      symbol: "SPY",
      direction: "bearish",
      notionalUsd: 2.4 * M,
      headline: "Large put ladder 560/550/540 · $2.4M premium",
      at: now - H * 2.5,
    },

    // -------------- AAPL (mixed, slightly bearish) --------------
    {
      id: "evt_13",
      channel: "insider",
      symbol: "AAPL",
      direction: "bearish",
      notionalUsd: 80 * M,
      headline: "Tim Cook SELL $80M",
      at: now - H * 10,
    },
    {
      id: "evt_14",
      channel: "jet",
      symbol: "AAPL",
      direction: "neutral",
      headline: "AAPL Gulfstream G650 BFI → JFK",
      at: now - H * 1.2,
    },

    // -------------- AMZN (bullish insider + political) --------------
    {
      id: "evt_15",
      channel: "insider",
      symbol: "AMZN",
      direction: "bullish",
      notionalUsd: 21 * M,
      headline: "Andy Jassy BUY $21M",
      at: now - H * 14,
    },
    {
      id: "evt_16",
      channel: "options",
      symbol: "AMZN",
      direction: "bullish",
      notionalUsd: 650_000,
      headline: "Call flow $190 strike Apr 25 · 17k contracts",
      at: now - H * 4,
    },

    // -------------- BTC (whale activity) --------------
    {
      id: "evt_17",
      channel: "whale",
      symbol: "BTC",
      direction: "bullish",
      notionalUsd: 12.4 * M,
      headline: "Binance → Coinbase · 180 BTC · exchange transfer",
      at: now - H * 1,
    },
    {
      id: "evt_18",
      channel: "whale",
      symbol: "BTC",
      direction: "bullish",
      notionalUsd: 6.0 * M,
      headline: "Coinbase → self-custody · HODL signal",
      at: now - H * 3,
    },
    {
      id: "evt_19",
      channel: "whale",
      symbol: "BTC",
      direction: "bearish",
      notionalUsd: 28.6 * M,
      headline: "Kraken → unknown · distribution pattern",
      at: now - H * 9,
    },

    // -------------- ETH --------------
    {
      id: "evt_20",
      channel: "whale",
      symbol: "ETH",
      direction: "bullish",
      notionalUsd: 14.8 * M,
      headline: "Binance → unknown cold wallet · accumulation",
      at: now - H * 2,
    },
    {
      id: "evt_21",
      channel: "whale",
      symbol: "ETH",
      direction: "bullish",
      notionalUsd: 8.1 * M,
      headline: "Unknown → Coinbase · accumulation",
      at: now - H * 5,
    },

    // -------------- XOM (vessel-driven) --------------
    {
      id: "evt_22",
      channel: "vessel",
      symbol: "XOM",
      direction: "bullish",
      notionalUsd: 0,
      headline: "14 VLCCs loitering off Fujairah · crude supply signal",
      at: now - H * 0.3,
    },
    {
      id: "evt_23",
      channel: "politician",
      symbol: "XOM",
      direction: "bullish",
      notionalUsd: 75_000,
      headline: "Tommy Tuberville BUY XOM $50k-$100k",
      at: now - H * 20,
    },

    // -------------- JPM (bullish cluster) --------------
    {
      id: "evt_24",
      channel: "insider",
      symbol: "JPM",
      direction: "bullish",
      notionalUsd: 72 * M,
      headline: "Jamie Dimon BUY $72M",
      at: now - H * 18,
    },
    {
      id: "evt_25",
      channel: "politician",
      symbol: "JPM",
      direction: "bullish",
      notionalUsd: 700_000,
      headline: "Rick Scott BUY JPM $500k-$1M",
      at: now - H * 16,
    },
    {
      id: "evt_26",
      channel: "jet",
      symbol: "JPM",
      direction: "neutral",
      headline: "JPM Gulfstream TEB → TEB · internal meeting",
      at: now - H * 0.8,
    },

    // -------------- MSFT (balanced) --------------
    {
      id: "evt_27",
      channel: "insider",
      symbol: "MSFT",
      direction: "bullish",
      notionalUsd: 18 * M,
      headline: "Satya Nadella BUY $18M",
      at: now - H * 22,
    },
    {
      id: "evt_28",
      channel: "dark_pool",
      symbol: "MSFT",
      direction: "bullish",
      notionalUsd: 306 * M,
      headline: "Dark pool print 1.18M shares · $306M notional",
      at: now - H * 6,
    },

    // -------------- META (bearish) --------------
    {
      id: "evt_29",
      channel: "insider",
      symbol: "META",
      direction: "bearish",
      notionalUsd: 52 * M,
      headline: "Mark Zuckerberg SELL $52M",
      at: now - H * 11,
    },
    {
      id: "evt_30",
      channel: "options",
      symbol: "META",
      direction: "bearish",
      notionalUsd: 380_000,
      headline: "Put sweep $520 strike May 9 · 19k contracts",
      at: now - H * 3.5,
    },
  ];
}

export function createStubSmartMoneyDataSource({ latencyMs = 180 } = {}) {
  return {
    async listEvents(sinceMs) {
      const events = buildEvents(Date.now());
      const filtered = sinceMs ? events.filter((e) => e.at >= sinceMs) : events;
      return new Promise((resolve) =>
        setTimeout(() => resolve(filtered), latencyMs)
      );
    },
  };
}

export default createStubSmartMoneyDataSource;
