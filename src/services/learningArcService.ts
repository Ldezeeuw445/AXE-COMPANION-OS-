/**
 * Learning Arc Service
 * 
 * Tracks trader behavior over time and derives insights:
 * - Top pairs and timeframes
 * - Preferred indicators
 * - Win/loss patterns
 * - Recent trades
 * - Alignment score updates
 */

export interface TraderLearningArc {
  traderId: string;
  topPairs: string[];
  topTimeframes: string[];
  topIndicators: string[];
  preferredSession: 'london' | 'newyork' | 'asia';
  recentWins: Array<{ pair: string; timeframe: string; gain: number; timestamp: string }>;
  recentLosses: Array<{ pair: string; timeframe: string; loss: number; timestamp: string }>;
  alignmentScore: number; // 0-100: how well AXE matches trader
  updatedAt: string;
}

/**
 * Fetch trader learning arc from Supabase
 */
export async function getTraderLearningArc(traderId: string): Promise<TraderLearningArc> {
  try {
    const response = await fetch(`/api/profile/learning-arc?userId=${traderId}`);
    if (!response.ok) {
      console.warn(`[LearningArc] Failed to fetch: ${response.status}`);
      return getDefaultArc(traderId);
    }

    return await response.json() as TraderLearningArc;
  } catch (error) {
    console.error('[LearningArc] Error:', error);
    return getDefaultArc(traderId);
  }
}

/**
 * Get default arc when data unavailable
 */
function getDefaultArc(traderId: string): TraderLearningArc {
  return {
    traderId,
    topPairs: ['EURUSD', 'GBPUSD', 'AUDUSD'],
    topTimeframes: ['1H', '4H', 'D'],
    topIndicators: ['RSI', 'MACD', 'MA'],
    preferredSession: 'london',
    recentWins: [],
    recentLosses: [],
    alignmentScore: 50,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Record a trade event (called from chart/order execution)
 */
export async function recordTradeEvent(
  traderId: string,
  event: {
    pair: string;
    timeframe: string;
    outcome: 'win' | 'loss' | 'breakeven';
    gain?: number;
    loss?: number;
    indicators?: string[];
    entryTime?: string;
    exitTime?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch('/api/profile/trade-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: traderId,
        ...event,
        timestamp: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      const error = await response.json() as { error?: string };
      return { success: false, error: error.error };
    }

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[LearningArc] Failed to record event:', errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Update alignment score based on AXE suggestions acceptance
 */
export async function updateAlignmentScore(
  traderId: string,
  action: 'accepted' | 'rejected' | 'followed',
  suggestionId: string
): Promise<{ newScore: number; change: number }> {
  try {
    const response = await fetch('/api/profile/alignment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: traderId,
        action,
        suggestionId,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to update alignment: ${response.status}`);
    }

    const data = await response.json() as { newScore: number; change: number };
    return data;
  } catch (error) {
    console.error('[LearningArc] Failed to update alignment:', error);
    return { newScore: 50, change: 0 };
  }
}

/**
 * Get trader's session preference (which market session they trade most)
 */
export async function getTraderSessionPreference(traderId: string): Promise<'london' | 'newyork' | 'asia'> {
  try {
    const arc = await getTraderLearningArc(traderId);
    return arc.preferredSession;
  } catch {
    return 'london';
  }
}

// TraderLearningArc is exported inline above
