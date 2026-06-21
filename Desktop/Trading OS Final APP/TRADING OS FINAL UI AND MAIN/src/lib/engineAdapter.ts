/**
 * Public entry for pages: legacy stubs/helpers plus the modular trading engine.
 *
 * - `getTradingAdapter()` — prefer this: Edge when `VITE_USE_ENGINE_EDGE=true`, else in-browser engine.
 * - `getTradingEngine()` — full instance (local only); for advanced use / dev.
 */
export * from './engineAdapterLegacy';

export type { CorporateJet, CorporateJetsMetrics, JetSignal } from '@/engine/types/intel';

export * from './tradingAdapterSingleton';
