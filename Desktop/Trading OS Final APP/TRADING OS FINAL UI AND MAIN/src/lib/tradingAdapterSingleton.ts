import { supabase } from './supabase';
import {
  createEngine,
  EngineAdapter,
  type EngineConfig,
  type EngineInstance,
} from '@/engine';
import type { TradingAdapterFacade } from '@/engine/adapter/tradingAdapterFacade';
import { RemoteEngineAdapter } from './remoteEngineAdapter';

export { createEngine, EngineAdapter, type EngineConfig, type EngineInstance };
export type { TradingAdapterFacade } from '@/engine/adapter/tradingAdapterFacade';

let tradingEngineSingleton: EngineInstance | null = null;
let remoteTradingAdapter: RemoteEngineAdapter | null = null;

/**
 * Warn once in dev if provider secrets are still in Vite env while Edge mode is on.
 * Those VITE_* values are not used by RemoteEngineAdapter and should not live in .env (they ship to the client bundle).
 */
function warnIfViteProviderKeysWithEdge(): void {
  if (!import.meta.env.DEV || import.meta.env.VITE_USE_ENGINE_EDGE !== 'true') return;
  const keys = [
    'VITE_FMP_API_KEY',
    'VITE_FRED_API_KEY',
    'VITE_POLYGON_API_KEY',
    'VITE_TWELVEDATA_API_KEY',
  ] as const;
  const env = import.meta.env as Record<string, string | undefined>;
  const present = keys.filter((k) => String(env[k] ?? '').trim() !== '');
  if (present.length === 0) return;
  const g = globalThis as unknown as { __tradingOsViteSecretWarned?: boolean };
  if (g.__tradingOsViteSecretWarned) return;
  g.__tradingOsViteSecretWarned = true;
  console.warn(
    `[Trading OS] VITE_USE_ENGINE_EDGE=true but ${present.join(', ')} are set. ` +
      'They are ignored for data calls and should be removed from .env — set FMP_API_KEY, FRED_API_KEY, POLYGON_API_KEY, TWELVEDATA_API_KEY (and optional news keys) as Supabase secrets on the engine-proxy Edge function instead.',
  );
}

/**
 * Same methods as `EngineAdapter`, backed either by Supabase Edge (`engine-proxy`) or local `createEngine`.
 * Production: use Edge (`VITE_USE_ENGINE_EDGE=true`); provider secrets only in Supabase Dashboard → Edge Function secrets.
 */
export function getTradingAdapter(): TradingAdapterFacade {
  if (import.meta.env.VITE_USE_ENGINE_EDGE === 'true') {
    warnIfViteProviderKeysWithEdge();
    if (!remoteTradingAdapter) remoteTradingAdapter = new RemoteEngineAdapter();
    return remoteTradingAdapter;
  }
  return getTradingEngine().adapter;
}

/**
 * In-browser engine — only for local/dev without Edge.
 * `VITE_*` provider keys are compiled into the client; never use this for production secrets.
 */
export function getTradingEngine(): EngineInstance {
  if (import.meta.env.VITE_USE_ENGINE_EDGE === 'true') {
    throw new Error('getTradingEngine() is disabled when VITE_USE_ENGINE_EDGE=true — use getTradingAdapter()');
  }
  if (!tradingEngineSingleton) {
    const cfg: EngineConfig = {
      supabase,
      fmpApiKey: import.meta.env.VITE_FMP_API_KEY,
      fredApiKey: import.meta.env.VITE_FRED_API_KEY,
      polygonApiKey: import.meta.env.VITE_POLYGON_API_KEY,
      twelvedataApiKey: import.meta.env.VITE_TWELVEDATA_API_KEY,
      enableYahooChartFallback: import.meta.env.VITE_ENABLE_YAHOO_CHART_FALLBACK === 'true',
    };
    tradingEngineSingleton = createEngine(cfg);
  }
  return tradingEngineSingleton;
}

