/**
 * Profile Engine
 * 
 * Loads and caches trader profile data from Supabase
 * Returns personalized preferences, learning arc, and alignment score
 */

import type { AdaptiveUiDecisionSet } from '@/types/adaptive';

export interface TraderProfile {
  id: string;
  displayName: string;
  timezone: string;
  location?: string;
  preferences: {
    morningBriefingOptIn: boolean;
    weatherOptIn: boolean;
    locationOptIn: boolean;
    briefingTone: 'focused' | 'casual' | 'strategic';
  };
}

/**
 * Fetch trader profile from Supabase
 */
export async function getTraderProfile(traderId: string): Promise<TraderProfile> {
  try {
    const response = await fetch(`/api/profile?userId=${traderId}`);
    if (!response.ok) {
      console.warn(`[Profile] Failed to fetch profile: ${response.status}`);
      return getDefaultProfile(traderId);
    }

    return await response.json() as TraderProfile;
  } catch (error) {
    console.error('[Profile] Error fetching profile:', error);
    return getDefaultProfile(traderId);
  }
}

/**
 * Get default profile when fetch fails
 */
function getDefaultProfile(traderId: string): TraderProfile {
  return {
    id: traderId,
    displayName: 'Trader',
    timezone: 'UTC',
    preferences: {
      morningBriefingOptIn: true,
      weatherOptIn: false,
      locationOptIn: false,
      briefingTone: 'focused',
    },
  };
}

/**
 * Get trader alignment score (how well AXE matches their style)
 * Based on trading history and learning arc
 */
export async function getTraderAlignmentScore(traderId: string): Promise<number> {
  try {
    const response = await fetch(`/api/profile/alignment?userId=${traderId}`);
    if (!response.ok) return 0;

    const data = await response.json() as { alignment: number };
    return Math.round(data.alignment);
  } catch (error) {
    console.error('[Profile] Error fetching alignment:', error);
    return 0;
  }
}

/**
 * Get top trading pairs for a trader
 */
export async function getTraderTopPairs(traderId: string, limit = 5): Promise<string[]> {
  try {
    const response = await fetch(`/api/profile/top-pairs?userId=${traderId}&limit=${limit}`);
    if (!response.ok) return [];

    const data = await response.json() as { pairs: string[] };
    return data.pairs;
  } catch (error) {
    console.error('[Profile] Error fetching top pairs:', error);
    return [];
  }
}

/**
 * Get recent wins for a trader
 */
export async function getTraderRecentWins(
  traderId: string,
  limit = 5
): Promise<Array<{ pair: string; timeframe: string; gain: number }>> {
  try {
    const response = await fetch(`/api/profile/recent-wins?userId=${traderId}&limit=${limit}`);
    if (!response.ok) return [];

    return await response.json() as Array<{ pair: string; timeframe: string; gain: number }>;
  } catch (error) {
    console.error('[Profile] Error fetching recent wins:', error);
    return [];
  }
}

/**
 * Build adaptive decision set for UI
 */
export async function buildDecisionSet(traderId: string): Promise<AdaptiveUiDecisionSet> {
  try {
    const [profile, alignment] = await Promise.all([
      getTraderProfile(traderId),
      getTraderAlignmentScore(traderId),
    ]);

    return {
      chart: {
        defaultSymbol: null,
        defaultTimeframes: [],
        enabledIndicators: [],
        chartModes: [],
        topQuickActions: [],
        fibMode: null,
      },
      cockpit: {
        preferredSessions: [],
        preferredInstruments: [],
        highlightPatterns: [],
      },
      briefing: {
        greeting: `Good morning, ${profile.displayName}.`,
        includeWeather: profile.preferences.weatherOptIn,
        sessionFocus: null,
        preferredPairs: [],
        tacticalPromptStyle: profile.preferences.briefingTone,
      },
      suggestions: [],
    };
  } catch (error) {
    console.error('[Profile] Error building decision set:', error);
    return {
      chart: {
        defaultSymbol: null,
        defaultTimeframes: [],
        enabledIndicators: [],
        chartModes: [],
        topQuickActions: [],
        fibMode: null,
      },
      cockpit: {
        preferredSessions: [],
        preferredInstruments: [],
        highlightPatterns: [],
      },
      briefing: {
        greeting: 'Good morning.',
        includeWeather: false,
        sessionFocus: null,
        preferredPairs: [],
        tacticalPromptStyle: 'focused',
      },
      suggestions: [],
    };
  }
}

// Export types
export type { TraderProfile };
