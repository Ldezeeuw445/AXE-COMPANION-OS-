// ================================================================
// FMP Ultimate example ContextDataSource.
// Wraps Financial Modeling Prep endpoints into the 4 methods the
// panels expect. All networking is normalized to the module's
// typed shapes — adjust field mapping if your FMP account returns
// different keys.
//
// NOTE: this file is an EXAMPLE. The module itself does NOT ship
// with FMP. Wire this through your own shared engine/worker and
// pass the resulting adapter to <ContextPanels dataSource={...} />.
// ================================================================

const FMP_BASE = 'https://financialmodelingprep.com/api';

function makeUrl(path, params, apiKey, version = 'v3') {
  const u = new URL(`${FMP_BASE}/${version}${path}`);
  if (params) Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, String(v)));
  u.searchParams.set('apikey', apiKey);
  return u.toString();
}

async function getJson(url, signal) {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`FMP ${res.status}`);
  return res.json();
}

/**
 * @param {{ apiKey: string, benchmark?: string }} opts
 */
export function createFmpContextDataSource(opts) {
  const { apiKey, benchmark = 'SPY' } = opts;
  if (!apiKey) throw new Error('FMP apiKey required');

  return {
    // ----------------------------------------------------------------
    async fetchAnalystConsensus({ symbol, signal }) {
      if (!symbol) return null;

      const [target, recs, quote, upgrades] = await Promise.all([
        getJson(makeUrl(`/price-target-consensus`, { symbol }, apiKey, 'v4'), signal).catch(() => []),
        getJson(makeUrl(`/analyst-stock-recommendations/${symbol}`, null, apiKey), signal).catch(() => []),
        getJson(makeUrl(`/quote/${symbol}`, null, apiKey), signal).catch(() => []),
        getJson(makeUrl(`/upgrades-downgrades`, { symbol }, apiKey, 'v4'), signal).catch(() => []),
      ]);

      const t = Array.isArray(target) ? target[0] : target;
      const r = Array.isArray(recs) ? recs[0] : null;
      const q = Array.isArray(quote) ? quote[0] : null;
      if (!t && !r) return null;

      return {
        symbol,
        currentPrice: q?.price ?? null,
        target: {
          average: t?.targetConsensus ?? null,
          low: t?.targetLow ?? null,
          high: t?.targetHigh ?? null,
          median: t?.targetMedian ?? null,
          numberOfAnalysts: t?.numberOfAnalysts ?? null,
        },
        ratings: {
          strongBuy:  r?.analystRatingsStrongBuy  ?? 0,
          buy:        r?.analystRatingsbuy        ?? r?.analystRatingsBuy ?? 0,
          hold:       r?.analystRatingsHold       ?? 0,
          sell:       r?.analystRatingsSell       ?? 0,
          strongSell: r?.analystRatingsStrongSell ?? 0,
        },
        recentActions: (upgrades || []).slice(0, 12).map((u, i) => ({
          id: String(u.publishedDate ?? i) + (u.newsPublisher ?? ''),
          firm: u.gradingCompany ?? u.analystCompany ?? 'Unknown',
          action: mapFmpAction(u.action, u),
          fromRating: u.previousGrade ?? null,
          toRating: u.newGrade ?? null,
          fromTarget: u.priceWhenPosted ?? null,
          toTarget: u.priceTarget ?? null,
          publishedAt: u.publishedDate ?? null,
          url: u.newsURL ?? null,
        })),
      };
    },

    // ----------------------------------------------------------------
    async fetchRelativePerformance({ symbol, signal }) {
      if (!symbol) return null;

      const peersRes = await getJson(
        makeUrl(`/stock_peers`, { symbol }, apiKey, 'v4'),
        signal,
      ).catch(() => []);
      const peersArr = (peersRes?.[0]?.peersList ?? []).slice(0, 6);
      const tickers = [symbol, ...peersArr, benchmark];

      const quotes = await getJson(
        makeUrl(`/quote/${tickers.join(',')}`, null, apiKey),
        signal,
      ).catch(() => []);
      if (!quotes.length) return null;

      const byTicker = Object.fromEntries(quotes.map((q) => [q.symbol, q]));
      const selected = byTicker[symbol];
      const benchQ   = byTicker[benchmark];

      const peers = peersArr
        .map((p) => byTicker[p])
        .filter(Boolean)
        .map((q) => ({
          symbol: q.symbol,
          name: q.name ?? q.symbol,
          changePercent: q.changesPercentage ?? 0,
          price: q.price ?? 0,
        }));

      // Sector avg ≈ simple mean of peers
      const sectorAverage = peers.length
        ? peers.reduce((sum, p) => sum + (p.changePercent || 0), 0) / peers.length
        : null;

      return {
        symbol,
        sectorName: selected?.sector ?? null,
        benchmark: benchQ
          ? { symbol: benchQ.symbol, changePercent: benchQ.changesPercentage ?? 0 }
          : null,
        sectorAverage,
        peers: [
          {
            symbol,
            name: selected?.name ?? symbol,
            changePercent: selected?.changesPercentage ?? 0,
            price: selected?.price ?? 0,
            isSelected: true,
          },
          ...peers,
        ],
      };
    },

    // ----------------------------------------------------------------
    async fetchKeyLevels({ symbol, signal }) {
      if (!symbol) return null;

      const [quote, rsi, sma20, sma50, sma200, hist] = await Promise.all([
        getJson(makeUrl(`/quote/${symbol}`, null, apiKey), signal).catch(() => []),
        getJson(
          makeUrl(`/technical_indicator/daily/${symbol}`, { period: 14, type: 'rsi' }, apiKey),
          signal,
        ).catch(() => []),
        getJson(
          makeUrl(`/technical_indicator/daily/${symbol}`, { period: 20, type: 'sma' }, apiKey),
          signal,
        ).catch(() => []),
        getJson(
          makeUrl(`/technical_indicator/daily/${symbol}`, { period: 50, type: 'sma' }, apiKey),
          signal,
        ).catch(() => []),
        getJson(
          makeUrl(`/technical_indicator/daily/${symbol}`, { period: 200, type: 'sma' }, apiKey),
          signal,
        ).catch(() => []),
        getJson(makeUrl(`/historical-price-full/${symbol}`, { serietype: 'line' }, apiKey), signal)
          .catch(() => ({ historical: [] })),
      ]);

      const q = Array.isArray(quote) ? quote[0] : null;
      if (!q) return null;

      const price = q.price ?? 0;
      const hi52 = q.yearHigh ?? null;
      const lo52 = q.yearLow  ?? null;
      const ath = (hist?.historical ?? []).reduce(
        (m, row) => Math.max(m, row.close ?? row.price ?? 0),
        0,
      ) || null;

      const ma = (res, period) => {
        const row = Array.isArray(res) ? res[0] : null;
        if (!row) return null;
        const value = row.sma ?? row.value ?? null;
        if (value == null) return null;
        return {
          period,
          value,
          distancePercent: price ? ((price - value) / value) * 100 : 0,
        };
      };

      const mas = [ma(sma20, 20), ma(sma50, 50), ma(sma200, 200)].filter(Boolean);
      const rsiRow = Array.isArray(rsi) ? rsi[0] : null;
      const rsiVal = rsiRow?.rsi ?? null;

      const indicators = [];
      if (rsiVal != null) {
        indicators.push({
          name: 'RSI-14',
          value: rsiVal,
          signal: rsiVal >= 70 ? 'overbought' : rsiVal <= 30 ? 'oversold' : 'neutral',
        });
      }

      // Simple support/resistance from MAs + 52W edges
      const levels = [];
      if (hi52 != null) {
        levels.push({
          kind: 'resistance',
          label: '52W high',
          price: hi52,
          distancePercent: price ? ((hi52 - price) / price) * 100 : null,
        });
      }
      mas.forEach((m) => {
        levels.push({
          kind: price >= m.value ? 'support' : 'resistance',
          label: `${m.period}MA`,
          price: m.value,
          distancePercent: price ? ((m.value - price) / price) * 100 : null,
        });
      });
      if (lo52 != null) {
        levels.push({
          kind: 'support',
          label: '52W low',
          price: lo52,
          distancePercent: price ? ((lo52 - price) / price) * 100 : null,
        });
      }

      return {
        symbol,
        currentPrice: price,
        week52Low: lo52,
        week52High: hi52,
        ath,
        drawdownFromAth: ath && price ? ((price - ath) / ath) * 100 : null,
        movingAverages: mas,
        indicators,
        levels,
      };
    },

    // ----------------------------------------------------------------
    async fetchSentimentShort({ symbol, signal }) {
      if (!symbol) return null;

      const [shortRows, sentRows] = await Promise.all([
        getJson(
          makeUrl(`/historical/shares_float`, { symbol }, apiKey, 'v4'),
          signal,
        ).catch(() => []),
        getJson(
          makeUrl(`/stock-news-sentiments-rss-feed`, { page: 0, tickers: symbol }, apiKey, 'v4'),
          signal,
        ).catch(() => []),
      ]);

      const sr = Array.isArray(shortRows) ? shortRows[0] : null;
      const shortInterest = sr
        ? {
            shortPercentOfFloat: sr.shortPercentOfFloat ?? sr.shortFloat ?? null,
            daysToCover: sr.daysToCover ?? null,
            borrowRate: null, // FMP does not expose borrow rate; plug in from Ortex/Interactive Brokers
            shortSharesOutstanding: sr.shortShares ?? null,
            asOf: sr.date ?? null,
          }
        : null;

      // Aggregate FMP news sentiment rows into a 24h window score
      const now = Date.now();
      const windowMs = 24 * 60 * 60 * 1000;
      let bull = 0,
        bear = 0,
        neu = 0,
        sumScore = 0,
        n = 0;

      (sentRows || []).forEach((row) => {
        const t = row.publishedDate ? new Date(row.publishedDate).getTime() : 0;
        if (!t || now - t > windowMs) return;
        const score = row.sentimentScore ?? 0;
        sumScore += score;
        n += 1;
        if (score > 0.15) bull += 1;
        else if (score < -0.15) bear += 1;
        else neu += 1;
      });

      const newsSentiment = n
        ? {
            score: sumScore / n,
            windowHours: 24,
            bullishCount: bull,
            bearishCount: bear,
            neutralCount: neu,
          }
        : null;

      // Simple squeeze heuristic — combine % of float, DTC, and bearish news
      let squeeze = null;
      if (shortInterest?.shortPercentOfFloat != null) {
        const sf = shortInterest.shortPercentOfFloat;
        const dtc = shortInterest.daysToCover ?? 0;
        const bullBias = newsSentiment?.score ?? 0;
        squeeze = Math.min(
          100,
          Math.max(0, sf * 2 + dtc * 3 + Math.max(0, bullBias) * 30),
        );
      }

      return {
        symbol,
        squeezeScore: squeeze,
        shortInterest,
        putCall: null, // FMP does not expose put/call ratio; connect from CBOE or Polygon
        newsSentiment,
      };
    },
  };
}

function mapFmpAction(action = '', row) {
  const a = String(action || '').toLowerCase();
  if (a.includes('upgrade'))   return 'upgrade';
  if (a.includes('downgrade')) return 'downgrade';
  if (a.includes('initiat'))   return 'initiate';
  if (a.includes('reiter'))    return 'reiterate';
  if (row?.priceTarget && row?.priceWhenPosted) {
    return row.priceTarget > row.priceWhenPosted ? 'target_raised' : 'target_lowered';
  }
  return 'reiterate';
}
