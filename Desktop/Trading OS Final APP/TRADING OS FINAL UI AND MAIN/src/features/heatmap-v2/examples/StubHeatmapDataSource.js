/**
 * StubHeatmapDataSource
 *
 * Demo HeatmapDataSource with a curated S&P subset (~80 tickers across
 * sectors). Replace with real adapter using FMP ultimate:
 *   - /v3/stock-screener (sector, marketCap filter)
 *   - /v3/stock-price-change/{symbol} (1D/5D/1M/YTD/1Y)
 *   - /v3/quote/{symbols} (price, volume, peRatio)
 *
 * Contract in ../src/features/heatmap-v2/types.d.ts
 */

const B = 1e9;
const T = 1e12;

function mkSpark(seed) {
  // deterministic pseudo-random 24-point spark
  const out = [];
  let x = seed;
  let v = 100;
  for (let i = 0; i < 24; i += 1) {
    x = (x * 9301 + 49297) % 233280;
    const step = (x / 233280 - 0.5) * 4;
    v = Math.max(10, v + step);
    out.push(v);
  }
  return out;
}

// Curated tickers. Pct changes are illustrative — real adapter pipes in live.
const RAW = [
  // Technology
  ["AAPL", "Apple Inc.", "Technology", 3.4 * T, 224, [0.8, 2.1, 5.4, 12.3, 22.5], 28000000, 52000000, 33.5],
  ["MSFT", "Microsoft Corp.", "Technology", 3.2 * T, 432, [1.2, 3.1, 6.7, 18.1, 35.2], 21000000, 24000000, 36.2],
  ["NVDA", "NVIDIA Corp.", "Technology", 2.9 * T, 118, [3.4, 8.2, 14.5, 64.1, 142.3], 310000000, 280000000, 64.5],
  ["GOOGL", "Alphabet Inc.", "Technology", 2.1 * T, 172, [0.4, 1.8, 4.2, 15.5, 28.1], 22000000, 28000000, 25.1],
  ["META", "Meta Platforms", "Technology", 1.4 * T, 552, [-0.6, 2.4, 3.1, 38.2, 62.4], 14000000, 16000000, 28.5],
  ["AVGO", "Broadcom Inc.", "Technology", 780 * B, 168, [1.9, 4.5, 9.8, 42.1, 88.4], 24000000, 22000000, 42.3],
  ["ORCL", "Oracle Corp.", "Technology", 430 * B, 154, [0.7, 1.5, 3.2, 12.4, 18.5], 8000000, 9500000, 38.1],
  ["CRM", "Salesforce", "Technology", 290 * B, 301, [-1.2, -0.4, 2.8, 8.4, 14.2], 5500000, 6800000, 52.3],
  ["AMD", "Advanced Micro Devices", "Technology", 230 * B, 142, [2.8, 6.1, 11.4, 28.2, 45.8], 52000000, 48000000, 92.4],
  ["CSCO", "Cisco Systems", "Technology", 235 * B, 58, [0.2, 0.9, 1.8, 5.4, 8.2], 18000000, 22000000, 24.1],
  ["ADBE", "Adobe Inc.", "Technology", 240 * B, 545, [-0.9, -2.1, -4.5, -8.2, -12.4], 3200000, 3600000, 41.2],
  ["INTC", "Intel Corp.", "Technology", 95 * B, 22, [-2.1, -5.4, -12.5, -38.5, -54.2], 82000000, 68000000, 0],
  ["QCOM", "Qualcomm", "Technology", 180 * B, 162, [0.8, 2.1, 4.2, 8.5, 14.1], 9500000, 10200000, 19.8],
  ["TXN", "Texas Instruments", "Technology", 170 * B, 185, [-0.3, 1.2, 2.8, 9.4, 15.2], 5200000, 6100000, 35.2],

  // Communication
  ["NFLX", "Netflix Inc.", "Communication", 310 * B, 720, [1.2, 3.4, 5.8, 22.4, 52.1], 4500000, 4200000, 48.5],
  ["DIS", "The Walt Disney Co.", "Communication", 180 * B, 100, [-0.8, -1.2, -2.4, -4.5, -8.2], 11000000, 12500000, 38.2],
  ["CMCSA", "Comcast", "Communication", 155 * B, 40, [-0.2, 0.5, 1.2, -3.4, 2.8], 22000000, 24000000, 12.4],
  ["T", "AT&T Inc.", "Communication", 158 * B, 22, [0.4, 1.2, 2.8, 8.5, 18.4], 35000000, 38000000, 14.2],
  ["VZ", "Verizon", "Communication", 175 * B, 42, [0.1, 0.8, 2.1, 5.4, 12.4], 18000000, 16000000, 15.8],

  // Consumer Cyclical
  ["AMZN", "Amazon.com", "Consumer Cyclical", 2.2 * T, 210, [1.4, 3.2, 5.8, 28.4, 48.1], 42000000, 48000000, 48.2],
  ["TSLA", "Tesla Inc.", "Consumer Cyclical", 890 * B, 276, [4.2, 9.8, 18.2, 12.1, -8.5], 120000000, 92000000, 88.4],
  ["HD", "Home Depot", "Consumer Cyclical", 430 * B, 432, [0.3, 1.8, 3.4, 8.2, 14.5], 3800000, 4200000, 28.5],
  ["MCD", "McDonald's Corp.", "Consumer Cyclical", 215 * B, 295, [-0.4, 0.9, 2.1, -2.1, 4.5], 3200000, 3600000, 24.2],
  ["NKE", "Nike Inc.", "Consumer Cyclical", 105 * B, 70, [-1.8, -3.4, -5.2, -18.5, -24.2], 9500000, 8800000, 22.1],
  ["SBUX", "Starbucks", "Consumer Cyclical", 108 * B, 95, [0.8, 2.4, 4.5, 9.8, 14.2], 8500000, 9200000, 28.4],

  // Consumer Defensive
  ["WMT", "Walmart Inc.", "Consumer Defensive", 680 * B, 85, [0.4, 1.8, 3.2, 12.4, 28.5], 18000000, 22000000, 32.5],
  ["PG", "Procter & Gamble", "Consumer Defensive", 390 * B, 165, [0.2, 0.8, 1.8, 4.2, 8.4], 6800000, 7500000, 25.8],
  ["KO", "Coca-Cola", "Consumer Defensive", 280 * B, 65, [0.1, 0.5, 1.2, 4.5, 8.2], 15000000, 16500000, 24.1],
  ["PEP", "PepsiCo", "Consumer Defensive", 215 * B, 158, [-0.3, -0.8, -1.4, -2.8, -4.5], 5200000, 5800000, 22.5],
  ["COST", "Costco Wholesale", "Consumer Defensive", 380 * B, 858, [0.8, 2.4, 4.8, 18.2, 32.4], 2200000, 2500000, 52.8],
  ["PM", "Philip Morris", "Consumer Defensive", 170 * B, 108, [0.5, 1.4, 3.2, 9.8, 18.5], 4500000, 5200000, 18.4],

  // Financial Services
  ["BRK.B", "Berkshire Hathaway", "Financial Services", 980 * B, 452, [0.2, 0.8, 2.4, 12.4, 22.5], 3200000, 3500000, 12.4],
  ["JPM", "JPMorgan Chase", "Financial Services", 620 * B, 215, [0.4, 1.8, 4.2, 18.5, 38.4], 9500000, 10200000, 12.8],
  ["V", "Visa Inc.", "Financial Services", 560 * B, 285, [0.6, 1.9, 3.8, 9.8, 18.2], 6800000, 7500000, 32.4],
  ["MA", "Mastercard", "Financial Services", 450 * B, 485, [0.8, 2.1, 4.2, 11.2, 22.5], 2800000, 3200000, 36.5],
  ["BAC", "Bank of America", "Financial Services", 340 * B, 44, [1.2, 3.4, 5.8, 22.4, 42.1], 42000000, 48000000, 14.2],
  ["WFC", "Wells Fargo", "Financial Services", 220 * B, 62, [1.4, 3.8, 6.5, 25.4, 42.8], 22000000, 24000000, 13.1],
  ["GS", "Goldman Sachs", "Financial Services", 180 * B, 555, [2.1, 4.8, 8.5, 38.4, 58.2], 2800000, 3200000, 16.5],
  ["MS", "Morgan Stanley", "Financial Services", 175 * B, 108, [1.8, 4.2, 7.5, 28.4, 48.1], 8500000, 9800000, 18.4],

  // Healthcare
  ["LLY", "Eli Lilly", "Healthcare", 720 * B, 800, [0.8, 2.4, 4.5, 18.2, 42.5], 4500000, 5200000, 82.4],
  ["UNH", "UnitedHealth Group", "Healthcare", 520 * B, 565, [-0.4, 1.2, 2.8, 8.4, 14.2], 3200000, 3800000, 22.1],
  ["JNJ", "Johnson & Johnson", "Healthcare", 380 * B, 158, [0.2, 0.8, 1.4, 3.2, 4.8], 8500000, 9200000, 24.5],
  ["ABBV", "AbbVie Inc.", "Healthcare", 330 * B, 185, [0.4, 1.2, 2.8, 8.5, 18.4], 7200000, 7800000, 28.2],
  ["MRK", "Merck & Co.", "Healthcare", 275 * B, 108, [-0.8, -2.1, -4.5, -12.4, -18.5], 9500000, 10200000, 22.5],
  ["PFE", "Pfizer Inc.", "Healthcare", 155 * B, 27, [-1.2, -2.8, -5.4, -8.5, -12.4], 42000000, 45000000, 18.2],
  ["TMO", "Thermo Fisher", "Healthcare", 210 * B, 545, [0.3, 1.4, 2.8, 5.4, 12.5], 2200000, 2500000, 34.2],
  ["ABT", "Abbott Laboratories", "Healthcare", 195 * B, 112, [0.5, 1.8, 3.4, 8.4, 14.2], 6500000, 7200000, 28.5],

  // Industrials
  ["CAT", "Caterpillar Inc.", "Industrials", 180 * B, 368, [1.2, 3.4, 6.8, 18.4, 32.5], 2800000, 3200000, 16.8],
  ["GE", "General Electric", "Industrials", 195 * B, 180, [1.8, 4.2, 7.5, 32.4, 62.8], 5500000, 6200000, 42.1],
  ["BA", "Boeing Co.", "Industrials", 105 * B, 170, [-2.4, -5.8, -12.5, -24.8, -38.4], 9500000, 10800000, 0],
  ["RTX", "RTX Corp.", "Industrials", 160 * B, 120, [0.8, 2.4, 4.5, 18.2, 28.5], 6800000, 7500000, 32.4],
  ["HON", "Honeywell", "Industrials", 140 * B, 215, [0.3, 1.2, 2.4, 5.8, 9.8], 3500000, 4200000, 26.5],
  ["UPS", "United Parcel Service", "Industrials", 115 * B, 135, [-0.8, -2.1, -4.2, -12.4, -18.5], 4500000, 5200000, 22.1],
  ["DE", "Deere & Co.", "Industrials", 115 * B, 418, [0.5, 1.8, 3.4, 8.5, 14.2], 2200000, 2500000, 14.2],

  // Energy
  ["XOM", "Exxon Mobil", "Energy", 480 * B, 118, [0.8, 2.4, 4.2, -5.2, 8.4], 18000000, 20000000, 14.5],
  ["CVX", "Chevron Corp.", "Energy", 290 * B, 162, [0.4, 1.8, 3.2, -2.8, 6.5], 9500000, 10800000, 15.8],
  ["COP", "ConocoPhillips", "Energy", 130 * B, 108, [1.2, 3.4, 5.8, -4.5, 9.8], 8500000, 9200000, 13.2],
  ["EOG", "EOG Resources", "Energy", 70 * B, 122, [1.4, 3.8, 6.5, -2.1, 11.2], 4500000, 5200000, 11.5],
  ["SLB", "Schlumberger", "Energy", 65 * B, 45, [-1.2, -2.8, -5.4, -12.4, -18.5], 18000000, 16500000, 14.8],

  // Utilities
  ["NEE", "NextEra Energy", "Utilities", 165 * B, 80, [0.3, 1.2, 2.4, 8.5, 12.4], 9500000, 10800000, 22.4],
  ["SO", "Southern Co.", "Utilities", 95 * B, 88, [0.2, 0.8, 1.4, 5.2, 8.4], 4500000, 5200000, 22.5],
  ["DUK", "Duke Energy", "Utilities", 88 * B, 115, [0.1, 0.5, 1.2, 4.5, 6.8], 3500000, 4200000, 18.4],

  // Real Estate
  ["PLD", "Prologis", "Real Estate", 115 * B, 125, [-0.4, -1.2, -2.8, -5.4, -8.2], 5500000, 6200000, 28.2],
  ["AMT", "American Tower", "Real Estate", 95 * B, 205, [-0.2, -0.8, -1.4, -4.5, -6.8], 3200000, 3800000, 32.5],
  ["EQIX", "Equinix Inc.", "Real Estate", 80 * B, 850, [0.4, 1.8, 3.4, 8.2, 14.5], 500000, 600000, 68.5],

  // Materials
  ["LIN", "Linde plc", "Materials", 215 * B, 450, [0.2, 0.8, 1.8, 4.5, 8.4], 2200000, 2500000, 32.4],
  ["SHW", "Sherwin-Williams", "Materials", 90 * B, 360, [0.3, 1.2, 2.4, 6.8, 9.8], 1500000, 1800000, 28.5],
  ["FCX", "Freeport-McMoRan", "Materials", 65 * B, 45, [1.8, 4.5, 8.2, 12.4, 18.5], 18000000, 20000000, 24.2],
];

function toTimeframeChanges([d, w, m, ytd, y]) {
  return { "1D": d, "1W": w, "1M": m, YTD: ytd, "1Y": y };
}

const TICKERS = RAW.map((r, i) => ({
  symbol: r[0],
  name: r[1],
  sector: r[2],
  marketCap: r[3],
  price: r[4],
  changes: toTimeframeChanges(r[5]),
  volume: r[6],
  avgVolume: r[7],
  peRatio: r[8] || undefined,
  sparkline: mkSpark(i + 1),
}));

export function createStubHeatmapDataSource({ latencyMs = 150 } = {}) {
  return {
    async getSnapshot() {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            asOf: Date.now(),
            tickers: TICKERS.slice(),
          });
        }, latencyMs);
      });
    },
  };
}

export default createStubHeatmapDataSource;
