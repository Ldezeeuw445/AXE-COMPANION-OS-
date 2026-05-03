import type {
  AnalystConsensusData,
  RelativePerformanceData,
  KeyLevelsData,
  SentimentShortData,
} from '@/engine/types/context';
import { getTradingAdapter } from '@/lib/tradingAdapterSingleton';

type FetchParams = { symbol: string; signal?: AbortSignal };

export function createEngineContextDataSource() {
  const adapter = getTradingAdapter();

  return {
    async fetchAnalystConsensus({ symbol, signal: _signal }: FetchParams): Promise<AnalystConsensusData | null> {
      return adapter.getAnalystConsensus(symbol);
    },
    async fetchRelativePerformance({ symbol, signal: _signal }: FetchParams): Promise<RelativePerformanceData | null> {
      return adapter.getRelativePerformance(symbol);
    },
    async fetchKeyLevels({ symbol, signal: _signal }: FetchParams): Promise<KeyLevelsData | null> {
      return adapter.getKeyLevels(symbol);
    },
    async fetchSentimentShort({ symbol, signal: _signal }: FetchParams): Promise<SentimentShortData | null> {
      return adapter.getSentimentShort(symbol);
    },
  };
}

