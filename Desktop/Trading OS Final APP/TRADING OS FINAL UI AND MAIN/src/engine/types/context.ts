export interface AnalystRatingBreakdown {
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
}

export interface PriceTarget {
  average: number;
  high: number;
  low: number;
  median?: number;
  numberOfAnalysts: number;
  currency?: string;
}

export type AnalystActionType =
  | 'upgrade'
  | 'downgrade'
  | 'initiate'
  | 'reiterate'
  | 'target_raised'
  | 'target_lowered';

export interface AnalystAction {
  id: string;
  publishedAt: number; // ms epoch
  firm: string;
  action: AnalystActionType;
  fromRating?: string;
  toRating?: string;
  fromTarget?: number;
  toTarget?: number;
  url?: string;
}

export interface AnalystConsensusData {
  symbol: string;
  currentPrice: number;
  ratings: AnalystRatingBreakdown;
  target: PriceTarget;
  recentActions: AnalystAction[];
}

export interface PeerPerformance {
  symbol: string;
  name?: string;
  changePercent: number;
  price: number;
  isSelected?: boolean;
}

export interface RelativePerformanceData {
  symbol: string;
  peers: PeerPerformance[];
  sectorAverage?: number;
  sectorName?: string;
  benchmark?: { symbol: string; changePercent: number };
}

export interface MovingAverage {
  period: number;
  value: number;
  distancePercent: number;
}

export interface TechnicalIndicator {
  name: string;
  value: number;
  signal?: 'bullish' | 'bearish' | 'neutral' | 'oversold' | 'overbought';
  extra?: Record<string, number>;
}

export interface ContextKeyLevel {
  label: string;
  price: number;
  kind: 'resistance' | 'support' | 'neutral';
  distancePercent?: number;
}

export interface KeyLevelsData {
  symbol: string;
  currentPrice: number;
  week52High: number;
  week52Low: number;
  ath?: number;
  atl?: number;
  drawdownFromAth?: number;
  movingAverages: MovingAverage[];
  indicators: TechnicalIndicator[];
  levels: ContextKeyLevel[];
}

export interface SentimentShortData {
  symbol: string;
  shortInterest?: {
    shortPercentOfFloat?: number;
    daysToCover?: number;
    borrowRate?: number;
    shortSharesOutstanding?: number;
    asOfDate?: number;
  };
  putCall?: {
    ratio: number;
    fiveDayTrend?: number[];
    change?: number;
  };
  newsSentiment?: {
    score: number;
    bullishCount: number;
    bearishCount: number;
    neutralCount: number;
    windowHours: number;
  };
  squeezeScore?: number;
}

