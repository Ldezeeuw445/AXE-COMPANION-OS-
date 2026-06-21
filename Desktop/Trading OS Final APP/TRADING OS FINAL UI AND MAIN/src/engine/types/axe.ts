/**
 * engine/types/axe.ts
 * ===================
 * Axe (AI assistant) contract — UI-facing shape.
 * Supabase = memory truth. Analysis = computed context.
 */

export type AxeMemoryType = 'commitment' | 'insight' | 'alert' | 'note';

export interface AxeMemoryItem {
  id: string;
  type: AxeMemoryType;
  content: string;
  symbol?: string;
  createdAt: string;
  resolvedAt?: string;
  priority?: 'low' | 'medium' | 'high';
}

export interface KeyLevel {
  price: number;
  type: 'support' | 'resistance' | 'pivot' | 'fibonacci' | 'vwap' | 'psychological';
  strength: number;     // 0-1
  touches?: number;
}

export interface Pattern {
  name: string;
  type: 'continuation' | 'reversal' | 'neutral';
  confidence: number;   // 0-1
  startTime: string;
  endTime?: string;
}

export interface Signal {
  name: string;
  direction: 'bullish' | 'bearish' | 'neutral';
  strength: number;     // 0-1
  timeframe: string;
  indicator?: string;
}

export interface AxeContext {
  symbol: string;
  timeframe: string;
  bias: 'bullish' | 'bearish' | 'neutral';
  confidence: number;   // 0-1
  keyLevels: KeyLevel[];
  patterns: Pattern[];
  signals: Signal[];
  memory: AxeMemoryItem[];
  lastUpdated: string;
  analysis?: string;    // Human-readable summary
}

export interface AxeStatus {
  isOnline: boolean;
  lastActivity: string;
  activeSymbols: string[];
  pendingAlerts: number;
  memoryCount: number;
}
