declare module '@/features/news-context' {
  import type { FC } from 'react';

  export const ContextPanels: FC<{
    dataSource: unknown;
    symbol: string;
    side?: 'left' | 'right' | 'both';
    refreshInterval?: number;
    className?: string;
    naturalHeight?: boolean;
  }>;
}

declare module '@/features/news-context/examples/StubContextDataSource' {
  export const stubContextDataSource: Record<string, unknown>;
}
