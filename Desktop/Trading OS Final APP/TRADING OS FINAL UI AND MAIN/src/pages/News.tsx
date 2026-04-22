import { useMemo } from 'react';
import { Newspaper } from 'lucide-react';
import { NewsTab } from '@/features/news';
import type { DataSource } from '@/features/news/types';
import { ContextPanels } from '@/features/news-context';
import { stubContextDataSource } from '@/features/news-context/examples/StubContextDataSource';
import { NewsExtras } from '@/features/news-extras';
import { createStubAlertsDataSource } from '@/features/news-extras/examples/StubAlertsDataSource';
import { createStubCatalystsDataSource } from '@/features/news-extras/examples/StubCatalystsDataSource';

/** Shared with NewsTab + context asides — keep in sync with NewsTab `initialSymbol`. */
const INITIAL_SYMBOL = 'AAPL';

const stubDataSource: DataSource = {
  fetchFeed: async () => [],
  fetchMiniFeed: async () => [],
  fetchQuote: async () => null,
  fetchTicker: async () => [],
  searchSymbols: async () => [],
};

// TODO: Replace stubContextDataSource with the shared engine adapter when it exposes context APIs.

export default function News() {
  const alertsDS = useMemo(() => createStubAlertsDataSource(), []);
  const catalystsDS = useMemo(() => createStubCatalystsDataSource(), []);

  return (
    <div className="flex h-full w-full min-h-0 flex-col overflow-hidden bg-[#0a0a0a]">
      <div className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-2">
        <div className="flex items-center gap-3">
          <Newspaper size={14} className="text-cyan-400" aria-hidden />
          <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-white/40">NEWS</span>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="w-[320px] shrink-0 overflow-hidden border-r border-white/5">
          <ContextPanels
            dataSource={stubContextDataSource}
            symbol={INITIAL_SYMBOL}
            side="left"
          />
        </aside>
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-hidden">
            <NewsTab dataSource={stubDataSource} initialSymbol={INITIAL_SYMBOL} />
          </div>
          <div className="max-h-[min(40vh,420px)] shrink-0 overflow-y-auto border-t border-white/5 scrollbar-hide">
            <NewsExtras
              panels={['alerts', 'catalysts', 'hotkeys']}
              alertsDataSource={alertsDS}
              catalystsDataSource={catalystsDS}
              symbol={INITIAL_SYMBOL}
            />
          </div>
        </main>
        <aside className="w-[320px] shrink-0 overflow-hidden border-l border-white/5">
          <ContextPanels
            dataSource={stubContextDataSource}
            symbol={INITIAL_SYMBOL}
            side="right"
          />
        </aside>
      </div>
    </div>
  );
}
