/**
 * engine/types/dashboard.ts
 * =========================
 * Dashboard/Ops contract — UI-facing shape for engine metrics.
 * Real-time insight into provider health, credit usage, efficiency.
 */

export interface ProviderMetric {
  id: string;
  provider: string;
  isHealthy: boolean;
  isInCooldown: boolean;
  cooldownRemainingSec?: number;
  usedThisMonth: number;
  monthlyLimit: number;
  remainingThisMonth: number;
  utilizationPercent: number;
  usedToday: number;
  dailyLimit: number;
  remainingToday: number;
  failureCount: number;
  lastSuccess: string;
  lastError: string;
  avgLatencyMs: number;
  dataQuality: number;
}

export interface CacheMetric {
  size: number;
  maxSize: number;
  hits: number;
  misses: number;
  staleServes: number;
  evictions: number;
  hitRate: number;
  missRate: number;
}

export interface InflightMetric {
  activeRequests: number;
  totalDedupes: number;
}

export interface EfficiencyMetric {
  totalRequests: number;
  realApiCalls: number;
  cacheHits: number;
  creditsSaved: number;
  cacheHitRate: number;
  creditSavingsRate: number;
  avgLatencyMs: number;
  effectiveMultiplier: number;
  fallbacksUsed: number;
}

export interface EngineOverview {
  status: 'healthy' | 'degraded' | 'critical';
  activeProviders: number;
  totalProviders: number;
  providersInCooldown: number;
  totalCreditsAvailable: number;
  totalCreditsUsed: number;
  overallUtilization: number;
  cacheHitRate: number;
  creditSavingsRate: number;
  lastUpdated: string;
}

export interface Recommendation {
  priority: 'info' | 'warning' | 'critical';
  message: string;
  action?: string;
}

/** Declares whether createEngine received a non-empty API key for this domain (Edge = Supabase secrets). */
export interface ProviderCredentialSlot {
  domain: string;
  configured: boolean;
  /** Set these names in Supabase → Edge Functions → engine-proxy → Secrets */
  supabaseSecretNames: string[];
}

export interface DashboardData {
  overview: EngineOverview;
  efficiency: EfficiencyMetric;
  cache: CacheMetric;
  inflight: InflightMetric;
  providers: ProviderMetric[];
  recommendations: Recommendation[];
  /** Per-domain fallback counters since engine boot (best-effort; resets if singleton disabled). */
  fallbacksByDomain?: Record<string, number>;
  /** Present when DashboardService was constructed with credential reporting enabled */
  credentialSlots?: ProviderCredentialSlot[];
}

export interface TimeSeriesPoint {
  timestamp: string;
  cacheHitRate: number;
  creditSavingsRate: number;
  avgLatencyMs: number;
  activeProviders: number;
}

export interface HistoricalMetrics {
  points: TimeSeriesPoint[];
  timeframe: '1H' | '24H' | '7D' | '30D';
}
