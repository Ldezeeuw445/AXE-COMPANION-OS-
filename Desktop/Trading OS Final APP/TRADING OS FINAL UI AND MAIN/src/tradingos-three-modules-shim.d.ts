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
