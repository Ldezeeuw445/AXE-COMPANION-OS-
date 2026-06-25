// ================================================================
// Example stub ContextDataSource — returns mock data so the panels
// render immediately after integration, before your own engine is
// connected. Replace with FmpContextDataSource (see next file) or
// your own normalized adapter when ready.
// ================================================================

export const stubContextDataSource = {
  async fetchAnalystConsensus({ symbol, signal: _signal }) {
    if (!symbol) return null;
    return {
      symbol,
      currentPrice: 182.45,
      target: {
        average: 215.0,
        low: 165.0,
        high: 260.0,
        median: 212.0,
        numberOfAnalysts: 42,
      },
      ratings: {
        strongBuy: 18,
        buy: 14,
        hold: 8,
        sell: 2,
        strongSell: 0,
      },
      recentActions: [
        {
          id: '1',
          firm: 'Morgan Stanley',
          action: 'upgrade',
          fromRating: 'Equal-Weight',
          toRating: 'Overweight',
          toTarget: 235,
          publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
          url: 'https://example.com',
        },
        {
          id: '2',
          firm: 'Goldman Sachs',
          action: 'target_raised',
          fromTarget: 200,
          toTarget: 230,
          publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
        },
        {
          id: '3',
          firm: 'Barclays',
          action: 'downgrade',
          fromRating: 'Overweight',
          toRating: 'Equal-Weight',
          toTarget: 190,
          publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
        },
      ],
    };
  },

  async fetchRelativePerformance({ symbol, signal: _signal }) {
    if (!symbol) return null;
    return {
      symbol,
      sectorName: 'Technology',
      benchmark: { symbol: 'SPY', changePercent: 0.42 },
      sectorAverage: 0.78,
      peers: [
        { symbol, name: symbol, changePercent: 1.24, price: 182.45, isSelected: true },
        { symbol: 'MSFT', name: 'Microsoft', changePercent: 0.88, price: 411.2 },
        { symbol: 'GOOGL', name: 'Alphabet',  changePercent: 0.55, price: 163.1 },
        { symbol: 'NVDA',  name: 'NVIDIA',    changePercent: -1.12, price: 872.3 },
        { symbol: 'META',  name: 'Meta',      changePercent: 0.31, price: 498.7 },
      ],
    };
  },

  async fetchKeyLevels({ symbol, signal: _signal }) {
    if (!symbol) return null;
    const price = 182.45;
    return {
      symbol,
      currentPrice: price,
      week52Low: 142.1,
      week52High: 199.6,
      ath: 199.6,
      drawdownFromAth: ((price - 199.6) / 199.6) * 100,
      movingAverages: [
        { period: 20,  value: 178.2, distancePercent: ((price - 178.2) / 178.2) * 100 },
        { period: 50,  value: 174.8, distancePercent: ((price - 174.8) / 174.8) * 100 },
        { period: 200, value: 168.4, distancePercent: ((price - 168.4) / 168.4) * 100 },
      ],
      indicators: [
        { name: 'RSI-14', value: 58.4, signal: 'neutral' },
        { name: 'MACD',   value: 1.24, signal: 'bullish' },
      ],
      levels: [
        { kind: 'resistance', label: 'R2 week high', price: 188.5, distancePercent: ((188.5 - price) / price) * 100 },
        { kind: 'resistance', label: 'R1 prior high', price: 185.1, distancePercent: ((185.1 - price) / price) * 100 },
        { kind: 'pivot',      label: 'Pivot',         price: 181.2, distancePercent: ((181.2 - price) / price) * 100 },
        { kind: 'support',    label: 'S1 20MA',       price: 178.2, distancePercent: ((178.2 - price) / price) * 100 },
        { kind: 'support',    label: 'S2 50MA',       price: 174.8, distancePercent: ((174.8 - price) / price) * 100 },
      ],
    };
  },

  async fetchSentimentShort({ symbol, signal: _signal }) {
    if (!symbol) return null;
    return {
      symbol,
      squeezeScore: 42,
      shortInterest: {
        shortPercentOfFloat: 3.2,
        daysToCover: 1.8,
        borrowRate: 0.5,
        shortSharesOutstanding: 98_000_000,
        asOf: new Date().toISOString(),
      },
      putCall: {
        ratio: 0.82,
        change: -4.1,
        fiveDayTrend: [0.95, 0.88, 0.91, 0.86, 0.82],
      },
      newsSentiment: {
        score: 0.24,
        windowHours: 24,
        bullishCount: 18,
        bearishCount: 6,
        neutralCount: 11,
      },
    };
  },
};
