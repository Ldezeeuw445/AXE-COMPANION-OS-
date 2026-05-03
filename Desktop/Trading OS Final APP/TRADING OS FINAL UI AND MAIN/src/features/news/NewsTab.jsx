// ================================================================
// TradingOS · News Terminal — NewsTab (public entry)
//
// Pure presentation module. Your engine is the data source.
//
// Usage:
//
//   import { NewsTab } from '@/features/news';
//   import { myNewsEngine } from '@/lib/news-engine'; // your adapter
//
//   <NewsTab
//     dataSource={myNewsEngine}
//     renderChart={({ symbol }) => <TradingViewChart symbol={symbol} />}
//     onSymbolChange={(sym) => setActiveSymbol(sym)}
//     initialSymbol="AAPL"
//   />
//
// See types.d.ts for the full DataSource interface your engine must satisfy.
// ================================================================

import React, { useCallback, useContext, useRef, useState } from 'react';

import { NewsProvider, NewsContext } from './context/NewsContext.jsx';
import { useNewsFeed }      from './hooks/useNewsFeed.js';
import { useKeyboardNav }   from './hooks/useKeyboardNav.js';
import { useTerminalWatchlist } from '@/contexts/WatchlistContext';

import { TopBar }       from './components/TopBar.jsx';
import { TickerTape }   from './components/TickerTape.jsx';
import { LeftRail }     from './components/LeftRail.jsx';
import { FeedPanel }    from './components/FeedPanel.jsx';
import { QuoteCard }    from './components/QuoteCard.jsx';
import { ChartCard }    from './components/ChartCard.jsx';
import { MiniFeed }     from './components/MiniFeed.jsx';
import { HelpOverlay }  from './components/HelpOverlay.jsx';
import { StatusBar }    from './components/StatusBar.jsx';

import s from './styles/news.module.css';

// ----------------------------------------------------------------
// Toast system (internal — no external dep)
// ----------------------------------------------------------------
function useToasts() {
  const [toasts, setToasts] = useState([]);
  const addToast = useCallback((msg, type = '') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3600);
  }, []);
  return { toasts, addToast };
}

function Toasts({ toasts }) {
  if (!toasts.length) return null;
  return (
    <div className={s.toasts}>
      {toasts.map(({ id, msg, type }) => (
        <div key={id} className={`${s.toast} ${type ? s[type] : ''}`}>{msg}</div>
      ))}
    </div>
  );
}

// ----------------------------------------------------------------
// Inner app — consumes context, mounts all panels
// ----------------------------------------------------------------
function NewsApp({ renderChart, onSymbolChange, hideChart, className, fillShell }) {
  const {
    dataSource, symbol, setSymbol, feed, setFeed, stream, setStream, incErr, setStatus,
  } = useContext(NewsContext);

  const { toasts, addToast } = useToasts();

  const handleError = useCallback((err) => {
    incErr();
    setStatus('error');
    addToast(err?.message || 'Request failed', 'error');
  }, [incErr, setStatus, addToast]);

  const {
    items, loading, error, pendingNew, lastUpdate, nextPollAt,
    refresh, loadMore, clearPendingNew,
  } = useNewsFeed({
    dataSource,
    feed,
    symbol,
    stream,
    enabled: true,
    onError: handleError,
  });

  const {
    flatSymbols: watchlist,
    addSymbolToCategory,
    removeSymbol: removeFromWatchlist,
  } = useTerminalWatchlist();

  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [showHelp, setShowHelp]           = useState(false);

  const searchInputRef = useRef(null);
  const hideSuggestRef = useRef(() => {});

  const selectSymbol = useCallback((sym) => {
    if (!sym) return;
    const upper = String(sym).toUpperCase();
    setSymbol(upper);
    onSymbolChange?.(upper);
  }, [setSymbol, onSymbolChange]);

  const addCurrentToWatchlist = useCallback(() => {
    if (!symbol) { addToast('Search a symbol first', 'error'); return; }
    const added = addSymbolToCategory('FX', symbol);
    if (!added) addToast('Already in watchlist');
    else addToast(`${symbol} added to watchlist`, 'success');
  }, [symbol, addSymbolToCategory, addToast]);

  const nextPollIn = nextPollAt ? Math.max(0, nextPollAt - Date.now()) : 0;

  useKeyboardNav({
    searchInputRef,
    hideSuggestions: () => hideSuggestRef.current?.(),
    itemCount: items.length,
    selectedIndex,
    setSelectedIndex,
    items,
    setFeed,
    reload: refresh,
    addCurrentToWatchlist,
    stream,
    setStream,
    showHelp,
    setShowHelp,
    selectSymbol,
  });

  return (
    <div className={`${s.app}${fillShell ? ` ${s.appShellFill}` : ''} ${className || ''}`}>
      {/* Ambient background */}
      <div className={s.ambient} aria-hidden="true">
        <div className={`${s.blob} ${s['blob--a']}`} />
        <div className={`${s.blob} ${s['blob--b']}`} />
        <div className={s.grid} />
      </div>

      <TopBar
        onSelectSymbol={selectSymbol}
        onShowHelp={() => setShowHelp(true)}
        searchInputRef={searchInputRef}
        onHideSuggestions={() => hideSuggestRef.current?.()}
      />

      <TickerTape
        watchlist={watchlist}
        onSelectSymbol={selectSymbol}
      />

      <main className={s['grid-main']}>
        <LeftRail
          feedCount={items.length}
          watchlist={watchlist}
          onAddToWatchlist={addCurrentToWatchlist}
          onRemoveFromWatchlist={removeFromWatchlist}
          onSelectSymbol={selectSymbol}
          nextPollIn={nextPollIn}
        />

        <FeedPanel
          items={items}
          loading={loading}
          error={error}
          pendingNew={pendingNew}
          lastUpdate={lastUpdate}
          onLoadMore={loadMore}
          onClearPendingNew={clearPendingNew}
          onSelectSymbol={selectSymbol}
          selectedIndex={selectedIndex}
          setSelectedIndex={setSelectedIndex}
          onRefresh={refresh}
        />

        <aside className={s.stack}>
          <QuoteCard symbol={symbol} />
          {!hideChart && <ChartCard symbol={symbol} renderChart={renderChart} />}
          <MiniFeed kind="general" label="MACRO" />
          <MiniFeed kind="press"   label="PRESS" />
        </aside>
      </main>

      <StatusBar />

      {showHelp && <HelpOverlay onClose={() => setShowHelp(false)} />}
      <Toasts toasts={toasts} />
    </div>
  );
}

// ----------------------------------------------------------------
// NewsTab — public entry
// ----------------------------------------------------------------

/**
 * @param {import('./types.d.ts').NewsTabProps} props
 */
export function NewsTab({
  dataSource,
  renderChart,
  onSymbolChange,
  initialSymbol = null,
  initialFeed,
  hideChart = false,
  className = '',
  fillShell = false,
}) {
  if (!dataSource) {
    // Fail loud in dev — the module is useless without an adapter.
    // eslint-disable-next-line no-console
    console.error('[NewsTab] `dataSource` prop is required. See types.d.ts → DataSource.');
    return (
      <div className={className} style={{ padding: 24, color: '#ff6b6b', fontFamily: 'monospace' }}>
        NewsTab: missing <code>dataSource</code> prop. See README.
      </div>
    );
  }

  return (
    <NewsProvider dataSource={dataSource} initialSymbol={initialSymbol} initialFeed={initialFeed}>
      <NewsApp
        renderChart={renderChart}
        onSymbolChange={onSymbolChange}
        hideChart={hideChart}
        className={className}
        fillShell={fillShell}
      />
    </NewsProvider>
  );
}
