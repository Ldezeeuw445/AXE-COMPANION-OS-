declare module '@/features/news-extras' {
  import type { FC, ReactNode } from 'react';

  export const NewsExtras: FC<{
    alertsDataSource?: unknown;
    catalystsDataSource?: unknown;
    symbol?: string;
    panels?: Array<'alerts' | 'catalysts' | 'hotkeys'>;
    hotkeyRows?: unknown;
    catalystWindowHours?: number;
    className?: string;
    children?: ReactNode;
  }>;

  export const QuickAlerts: FC<{
    dataSource?: unknown;
    symbol?: string | null;
    refreshInterval?: number;
    className?: string;
    variant?: 'default' | 'sidebar';
  }>;

  export const NextCatalysts: FC<{
    dataSource?: unknown;
    symbol?: string | null;
    windowHours?: number;
    refreshInterval?: number;
    className?: string;
    variant?: 'default' | 'sidebar';
  }>;

  export const HotkeySheet: FC<{
    rows?: Array<{ group?: string; keys: string[]; label: string }>;
    className?: string;
    variant?: 'panel' | 'banner';
  }>;
}

declare module '@/features/news-extras/examples/StubAlertsDataSource' {
  export function createStubAlertsDataSource(opts?: { latencyMs?: number }): unknown;
}

declare module '@/features/news-extras/examples/StubCatalystsDataSource' {
  export function createStubCatalystsDataSource(opts?: { latencyMs?: number }): unknown;
}

declare module '@/features/heatmap-v2' {
  import type { FC } from 'react';

  export const HeatmapV2: FC<{
    dataSource: unknown;
    defaultTimeframe?: string;
    defaultMetric?: string;
    onTickerClick?: (ticker: string) => void;
  }>;
}

declare module '@/features/heatmap-v2/examples/StubHeatmapDataSource' {
  export function createStubHeatmapDataSource(opts?: { latencyMs?: number }): unknown;
}

declare module '@/features/analyses-library' {
  import type { FC } from 'react';

  export const AnalysesLibrary: FC<{
    dataSource: unknown;
    onOpenAnalysis: (a: { id: string }) => void;
  }>;
}

declare module '@/features/analyses-library/examples/StubAnalysesDataSource' {
  export function createStubAnalysesDataSource(opts?: { latencyMs?: number }): unknown;
}

declare module '@/features/smart-money' {
  import type { FC } from 'react';

  export const SmartMoneyBanner: FC<{
    dataSource: unknown;
    refreshMs?: number;
    onSignalSelect?: (s: { symbol: string }) => void;
    activeSymbol?: string | null;
    config?: unknown;
    windowHours?: number;
  }>;
}

declare module '@/features/smart-money/examples/StubSmartMoneyDataSource' {
  export function createStubSmartMoneyDataSource(opts?: { latencyMs?: number }): unknown;
}
