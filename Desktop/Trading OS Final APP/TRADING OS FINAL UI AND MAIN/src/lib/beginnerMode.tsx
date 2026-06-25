import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { BookOpen, ChevronDown } from 'lucide-react';

interface BeginnerModeCtx {
  beginner: boolean;
  toggle: () => void;
  setBeginner: (next: boolean) => void;
}

const BeginnerContext = createContext<BeginnerModeCtx>({
  beginner: false,
  toggle: () => {},
  setBeginner: () => {},
});

export function BeginnerModeProvider({ children }: { children: ReactNode }) {
  const [beginner, setBeginnerState] = useState(() => {
    try {
      return localStorage.getItem('tos_beginner') === '1';
    } catch {
      return false;
    }
  });

  const setBeginner = useCallback((next: boolean) => {
    setBeginnerState(() => {
      try {
        localStorage.setItem('tos_beginner', next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const toggle = useCallback(() => {
    setBeginner(!beginner);
  }, [beginner, setBeginner]);

  const value = useMemo(() => ({ beginner, toggle, setBeginner }), [beginner, toggle, setBeginner]);

  return <BeginnerContext.Provider value={value}>{children}</BeginnerContext.Provider>;
}

export function useBeginner() {
  return useContext(BeginnerContext);
}

export const WIDGET_LABELS: Record<string, { short: string; full: string; hint: string }> = {
  heatmap: {
    short: 'Heatmap',
    full: 'Market Heatmaps',
    hint:
      "Visual overviews that instantly show which markets are hot (moving a lot) and which are cold (barely moving).\n\nMarket tab: Colored squares for each symbol — green = up today, red = down. Bigger % move = stronger color.\nTreemap tab: Tiles sized by market cap weight. Bright green/red shows leaders/laggards.\nLiquidity tab: Shows bid/ask depth near the current price.\n\nHow to use it: Scan the heatmap each morning before trading. If a whole sector is red, that's macro risk. If one symbol is bright green in a sea of red, it's showing relative strength.",
  },
};

export function useWidgetLabel(key: string) {
  const { beginner } = useBeginner();
  const entry = WIDGET_LABELS[key];
  if (!entry) return { title: key, hint: undefined as string | undefined };
  return {
    title: beginner ? entry.full : entry.short,
    hint: beginner ? entry.hint : undefined,
  };
}

export function PageBeginnerBanner({ widgetKey }: { widgetKey: string }) {
  const { beginner } = useBeginner();
  const [collapsed, setCollapsed] = useState(false);
  const entry = WIDGET_LABELS[widgetKey];
  if (!beginner || !entry) return null;
  const paragraphs = entry.hint.split('\n\n').filter(Boolean);
  return (
    <div className="shrink-0 border-b border-blue-500/[0.12] bg-blue-950/[0.18] animate-in fade-in-0 slide-in-from-top-1 duration-200">
      <div className="flex items-center justify-between px-3 py-1.5">
        <div className="flex items-center gap-1.5">
          <BookOpen className="h-3 w-3 text-blue-400/50 shrink-0" />
          <span className="text-[9px] font-bold text-blue-400/60 uppercase tracking-widest">
            How to use · {entry.full}
          </span>
        </div>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="text-muted-foreground hover:text-muted-foreground transition-colors"
          aria-label={collapsed ? 'Show explanation' : 'Hide explanation'}
        >
          <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${collapsed ? '-rotate-90' : ''}`} />
        </button>
      </div>
      {!collapsed ? (
        <div className="px-3 pb-2.5 space-y-1.5">
          {paragraphs.map((para, i) => (
            <p
              key={i}
              className={`text-[10px] leading-relaxed ${i === 0 ? 'text-blue-100/50' : 'text-blue-100/35'}`}
            >
              {para}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

