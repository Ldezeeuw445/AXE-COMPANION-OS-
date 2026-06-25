# TradingOS · News Terminal v2

A Bloomberg-grade news terminal for your TradingOS stack. Zero dependencies, pure HTML/CSS/vanilla JS, powered entirely by **Financial Modeling Prep**.

## What makes v2 "terminal-grade"

- **Compact monospace row-based feed** — ~40 headlines per screen (not cards)
- **Auto-streaming** every 25s with diff detection + green flash on new items
- **Keyword tagging** with color codes — BREAKING · EARNINGS · UPGRADE · DOWNGRADE · M&A · SEC · GUIDANCE
- **Multi-pane layout** — primary feed center, macro + press mini-feeds right, quote + chart hook right
- **Keyboard-first** — `/` focus, `j/k` navigate, `1-4` switch feeds, `r` refresh, `a` add to watchlist, `s` toggle stream, `c` send to chart, `Enter` open, `?` help
- **Chart hook** — `#chartHook` element + `tradingos:symbol` event ready for DXCharts/TradingView mount
- **3-level depth** — realistic elevation hierarchy with warm underglow (matches your depth-elevation skill)
- **Live ticker tape** refreshing your watchlist every 30s
- **Filter pills** — one-click filter by tag across the current feed
- **Status bar** with UTC clock, req counter, err counter

## Keyboard shortcuts

| Key | Action |
|---|---|
| `/` | Focus search |
| `Esc` | Blur / close overlay |
| `j` / `↓` | Next headline |
| `k` / `↑` | Previous headline |
| `Enter` | Open selected headline in new tab |
| `c` | Send selected row's symbol to chart hook |
| `1` `2` `3` `4` | Switch feed (Stock · Macro · Press · FMP) |
| `r` | Refresh current feed |
| `a` | Add current symbol to watchlist |
| `s` | Toggle auto-stream |
| `?` | Keyboard shortcuts overlay |

## Setup

1. Grab a free FMP key at [financialmodelingprep.com](https://site.financialmodelingprep.com/developer/docs/dashboard)
2. Open `index.html` — paste your key in the modal (stored in `localStorage`)
3. Done. FMP supports CORS, so no proxy is needed.

Local dev:
```bash
python -m http.server 5173   # or: npx serve .
```

## FMP endpoints used

All on `https://financialmodelingprep.com/stable/*`:

| Feature | Endpoint |
|---|---|
| Symbol autocomplete | `/search-symbol?query=` |
| Name autocomplete   | `/search-name?query=`   |
| Quote               | `/quote?symbol=`        |
| Batch quote (tape)  | `/batch-quote?symbols=` |
| Stock news latest   | `/news/stock-latest?page=&limit=` |
| Stock news by sym   | `/news/stock?symbols=&page=&limit=` |
| General/macro news  | `/news/general-latest?page=&limit=` |
| Press releases      | `/news/press-releases-latest?page=&limit=` |
| Press by symbol     | `/news/press-releases?symbols=&page=&limit=` |
| FMP articles        | `/fmp-articles?page=&limit=` |

Centralised in the `api` object in `app.js` — swap, wrap or port freely.

## DXCharts / TradingView integration

The right-side chart card has a ready-to-mount target:

```js
// Listen for symbol selection (from search, chips, watchlist, or row click 'c' key)
window.addEventListener('tradingos:symbol', (e) => {
  const { symbol, mount } = e.detail;  // mount is the #chartHook element
  // Mount DXCharts Lite or your TradingView widget here:
  // myChart.update({ symbol });
});

// Or read state directly:
window.TradingOSNews.state.symbol;
window.TradingOSNews.selectSymbol('AAPL');
```

The placeholder in `#chartHook` is a Level 3 depth card — just replace its inner content with your charting lib on mount.

## Architecture

```
tradingos-news-v2/
├── index.html      Shell, modal, layout
├── assets/
│   ├── styles.css  3-level depth, compact terminal rows, responsive
│   └── app.js      FMP client · stream · tagging · shortcuts · chart hook
└── README.md
```

Everything is a single `IIFE`. No build step. No dependencies. Drop it in an iframe inside your TradingOS tab, or port the `api` object + keyboard controller into a React hook — the state shape is designed to survive that port.

## Customisation cheat sheet

| What | Where |
|---|---|
| Stream interval | `STREAM_INTERVAL` in `app.js` (default 25s) |
| Ticker interval | `TICKER_INTERVAL` in `app.js` |
| Page size | `PAGE_SIZE` (default 40) |
| Tag patterns | `TAG_PATTERNS` array in `app.js` — regex-based |
| Tag colors | `--tag-*` in `:root` of `styles.css` |
| Depth / elevation | `.elevation-1/2/3` classes (warm underglow at `rgba(255,247,230,*)`) |
| Default trending chips | `.chips` list in `index.html` |
| Default watchlist | `loadWatchlist()` fallback in `app.js` |

## Notes

- v2 is Bloomberg-inspired, not a clone. If you want *even* more density: drop thumbnails entirely (already done), tighten row height via `.row { padding: 5px 14px }`, increase `PAGE_SIZE` to 80+.
- Keyword tagging runs client-side on every headline. No ML, just pragmatic regex — fast and good enough for triage. Swap for a sentiment API if you want nuance.
- Stream diffs by URL hash — if FMP re-issues an item, it's still deduped.

Built for TradingOS. Happy trading.
