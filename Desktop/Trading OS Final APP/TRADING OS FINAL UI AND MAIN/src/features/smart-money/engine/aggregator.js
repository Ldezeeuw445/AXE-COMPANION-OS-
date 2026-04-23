/**
 * SmartMoney aggregator.
 *
 * Pure function: events -> ranked AggregatedSignal[].
 * No side effects, no I/O. Easy to unit-test.
 *
 * Scoring model:
 *   1. Each event has a base weight per channel.
 *   2. Size multiplier: log10(notionalUsd / 1M) clamped to [0, 2].
 *   3. Time decay: exponential with configurable half-life.
 *   4. Direction sign: bullish +1, bearish -1, neutral 0.
 *   5. Channel diversity bonus: unique channels backing a symbol boost confidence.
 *
 * Final score clamped to [-100, +100].
 */

const DEFAULT_CHANNEL_WEIGHTS = {
  politician: 14,
  insider: 20,
  whale: 12,
  dark_pool: 18,
  options: 22,
  jet: 10,
  vessel: 8,
  news: 6,
};

const DEFAULT_CONFIG = {
  halfLifeHours: 12,
  minNotionalUsd: 50_000,
  maxResults: 20,
};

const HOUR = 1000 * 60 * 60;

function sizeMultiplier(notionalUsd) {
  if (!notionalUsd || notionalUsd <= 0) return 0.5;
  const log = Math.log10(notionalUsd / 1_000_000);
  if (log <= 0) return 0.5;
  return Math.min(2, log + 0.5);
}

function directionSign(d) {
  if (d === "bullish") return 1;
  if (d === "bearish") return -1;
  return 0;
}

function decay(event, now, halfLifeHours) {
  const ageH = (now - event.at) / HOUR;
  if (ageH <= 0) return 1;
  return Math.pow(0.5, ageH / halfLifeHours);
}

function eventContribution(event, now, cfg) {
  const channelWeight =
    (cfg.channelWeights && cfg.channelWeights[event.channel]) ??
    DEFAULT_CHANNEL_WEIGHTS[event.channel] ??
    5;
  const base = event.weight != null ? event.weight * 30 : channelWeight;
  const sign = directionSign(event.direction);
  const size = sizeMultiplier(event.notionalUsd);
  const d = decay(event, now, cfg.halfLifeHours);
  return sign * base * size * d;
}

export function aggregate(events, config = {}) {
  const cfg = {
    ...DEFAULT_CONFIG,
    ...config,
    channelWeights: {
      ...DEFAULT_CHANNEL_WEIGHTS,
      ...(config.channelWeights || {}),
    },
  };
  const now = Date.now();
  const grouped = new Map();

  for (const ev of events) {
    if (!ev.symbol) continue;
    const sym = ev.symbol.toUpperCase();
    if (!grouped.has(sym)) {
      grouped.set(sym, {
        symbol: sym,
        rawScore: 0,
        channels: new Set(),
        totalNotionalUsd: 0,
        reasons: [],
        events: [],
        updatedAt: 0,
      });
    }
    const g = grouped.get(sym);
    g.rawScore += eventContribution(ev, now, cfg);
    g.channels.add(ev.channel);
    g.totalNotionalUsd += ev.notionalUsd || 0;
    g.events.push(ev);
    if (ev.at > g.updatedAt) g.updatedAt = ev.at;
  }

  const signals = [];
  for (const g of grouped.values()) {
    // sort events newest first
    g.events.sort((a, b) => b.at - a.at);

    // diversity bonus: +8 per extra channel beyond first
    const diversityBonus = Math.max(0, g.channels.size - 1) * 8;
    const signed = g.rawScore;
    const adjusted =
      signed >= 0 ? signed + diversityBonus : signed - diversityBonus;
    const score = Math.max(-100, Math.min(100, adjusted));

    // confidence is # of distinct channels, capped at 5
    const confidence = Math.max(1, Math.min(5, g.channels.size));

    const direction =
      score > 5 ? "bullish" : score < -5 ? "bearish" : "neutral";

    const reasons = g.events.slice(0, 5).map((e) => e.headline);

    signals.push({
      symbol: g.symbol,
      score: Math.round(score),
      confidence,
      direction,
      channels: Array.from(g.channels),
      totalNotionalUsd: g.totalNotionalUsd,
      reasons,
      events: g.events,
      updatedAt: g.updatedAt,
    });
  }

  // rank by absolute score, then recency
  signals.sort((a, b) => {
    const diff = Math.abs(b.score) - Math.abs(a.score);
    if (diff !== 0) return diff;
    return b.updatedAt - a.updatedAt;
  });

  return signals.slice(0, cfg.maxResults);
}

export { DEFAULT_CHANNEL_WEIGHTS };
