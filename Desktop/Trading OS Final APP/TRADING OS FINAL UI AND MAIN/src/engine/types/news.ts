/**
 * engine/types/news.ts
 * ====================
 * News contract — UI-facing shape.
 * No matter which provider (FMP, Financial Juice, cached), the UI always gets this.
 */

export interface NewsItem {
  id: string;
  source: string;
  title: string;
  summary?: string;
  url?: string;
  publishedAt: string;
  symbol?: string | null;
  category?: string | null;
  sentiment?: 'bullish' | 'bearish' | 'neutral' | null;
  importance?: number | null;
}

export interface NewsFilter {
  symbol?: string;
  category?: string;
  sentiment?: 'bullish' | 'bearish' | 'neutral';
  minImportance?: number;
  limit?: number;
}
