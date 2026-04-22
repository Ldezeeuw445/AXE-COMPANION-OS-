import { useMemo } from 'react';
import { Flame } from 'lucide-react';
import { HeatmapV2 } from '@/features/heatmap-v2';
import { createStubHeatmapDataSource } from '@/features/heatmap-v2/examples/StubHeatmapDataSource';

export default function Heatmap() {
  const ds = useMemo(() => createStubHeatmapDataSource(), []);

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden bg-[#0a0a0a]">
      <div className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-2">
        <div className="flex items-center gap-2">
          <Flame size={14} className="text-cyan-400" />
          <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-white/40">HEATMAP</span>
        </div>
      </div>
      <div className="min-h-0 flex-1 p-3">
        <div
          className="h-full w-full min-h-[480px]"
          style={{ height: 'calc(100vh - 120px)' }}
        >
          <HeatmapV2 dataSource={ds} defaultTimeframe="1D" defaultMetric="performance" />
        </div>
      </div>
    </div>
  );
}
