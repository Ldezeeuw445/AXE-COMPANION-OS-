declare module '@/features/datacenter-map' {
  import type { FC } from 'react';

  export const DataCenterMap: FC<{
    dataSource: unknown;
    refreshInterval?: number;
    defaultRegion?: string;
    className?: string;
  }>;
}

declare module '@/features/datacenter-map/examples/StubDataCenterDataSource' {
  export const stubDataCenterDataSource: Record<string, unknown>;
}
