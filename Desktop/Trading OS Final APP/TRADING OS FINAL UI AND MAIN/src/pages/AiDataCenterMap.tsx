import { useMemo } from 'react';
import { MapPin } from 'lucide-react';
import { DataCenterMap } from '@/features/datacenter-map';
import { createEngineAiDataCenterDataSource } from '@/lib/engineDataCenterDataSource';

export default function AiDataCenterPage() {
  const dataSource = useMemo(() => createEngineAiDataCenterDataSource(), []);
  return (
    <div className="flex flex-1 min-h-0 h-full flex-col overflow-hidden bg-[#0a0a0a]">
      <div className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-2">
        <div className="flex items-center gap-3">
          <MapPin size={14} className="text-cyan-400" aria-hidden />
          <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-white/40">
            AI DATA CENTER MAP
          </span>
          <span className="rounded border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 text-[9px] text-amber-200/80">
            PLACEHOLDER data via engineAdapter.aiDataCenters()
          </span>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <DataCenterMap dataSource={dataSource} />
      </div>
    </div>
  );
}
