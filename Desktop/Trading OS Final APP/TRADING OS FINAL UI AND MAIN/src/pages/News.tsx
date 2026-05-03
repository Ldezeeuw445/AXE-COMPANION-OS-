import { useMemo } from 'react';
import { Newspaper } from 'lucide-react';
import { useSymbol } from '@/contexts/SymbolContext';
import { NewsTab } from '@/features/news';
import { createEngineNewsDataSource } from '@/lib/engineNewsDataSource';
import { ContextPanels } from '@/features/news-context';
import { createEngineContextDataSource } from '@/lib/engineContextDataSource';
import {
  HotkeySheet,
} from '@/features/news-extras';

export default function News() {
  const { symbol, setSymbol } = useSymbol();
  const newsDataSource = useMemo(() => createEngineNewsDataSource(), []);
  const contextDataSource = useMemo(() => createEngineContextDataSource(), []);

  return (
    <div className="flex h-full w-full min-h-0 flex-col overflow-hidden bg-[#0a0a0a]">
      <div className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-2">
        <div className="flex items-center gap-3">
          <Newspaper size={14} className="text-cyan-400" aria-hidden />
          <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-white/40">NEWS</span>
        </div>
      </div>
      <HotkeySheet variant="banner" className="border-b border-white/5" />
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        {/*
          min-h-0: flex item may shrink so overflow-y works.
          Inner flex-1 min-h-0: fixed-height scroll strip; shrink-0 on sections so panels are never squashed.
        */}
        <aside className="flex h-full min-h-0 w-[min(300px,28vw)] shrink-0 flex-col overflow-hidden border-r border-white/5">
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden px-1 py-1 scrollbar-hide overscroll-y-contain">
            <div className="shrink-0">
              <ContextPanels
                dataSource={contextDataSource}
                symbol={symbol}
                side="left"
                naturalHeight
              />
            </div>
            <div className="shrink-0">
              {/* Hidden until a real (non-stub) data source exists. */}
            </div>
          </div>
        </aside>
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <NewsTab
            key={symbol}
            dataSource={newsDataSource}
            initialSymbol={symbol}
            onSymbolChange={setSymbol}
            fillShell
          />
        </main>
        <aside className="flex h-full min-h-0 w-[min(300px,28vw)] shrink-0 flex-col overflow-hidden border-l border-white/5">
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden px-1 py-1 scrollbar-hide overscroll-y-contain">
            <div className="shrink-0">
              <ContextPanels
                dataSource={contextDataSource}
                symbol={symbol}
                side="right"
                naturalHeight
              />
            </div>
            <div className="shrink-0">
              {/* Hidden until a real (non-stub) data source exists. */}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
