/* ================================================================
   TradingOS · News Terminal v2
   Pure-FMP client — terminal-grade: streaming, tagging, shortcuts,
   multi-pane, chart-hook.

   Endpoints (all /stable):
     /search-symbol · /search-name · /quote · /batch-quote
     /news/stock-latest · /news/stock
     /news/general-latest
     /news/press-releases-latest · /news/press-releases
     /fmp-articles
   ================================================================ */

(() => {
  'use strict';

  // ==============================================================
  // CONFIG
  // ==============================================================
  const FMP_BASE = 'https://financialmodelingprep.com/stable';

  const STORAGE = {
    key:       'tradingos.fmp.key',
    watchlist: 'tradingos.watchlist',
    feed:      'tradingos.feed',
    stream:    'tradingos.stream',
    filter:    'tradingos.filter',
  };

  const PAGE_SIZE         = 40;          // Bloomberg-ish density
  const MINI_SIZE         = 12;
  const STREAM_INTERVAL   = 25_000;      // 25s auto-poll
  const TICKER_INTERVAL   = 30_000;

  // ==============================================================
  // STATE
  // ==============================================================
  const state = {
    apiKey: null,
    feed: 'stock',
    symbol: null,
    filter: 'ALL',
    items: [],
    knownIds: new Set(),
    pendingNew: 0,
    selectedIndex: -1,
    page: 0,
    loading: false,
    stream: true,
    streamTimer: null,
    tickerTimer: null,
    nextPollAt: 0,
    watchlist: [],
    reqCount: 0,
    errCount: 0,
  };

  // Expose for external integrations (DXCharts etc.)
  window.TradingOSNews = {
    state,
    selectSymbol: (s) => selectSymbol(s),
    on: (evt, fn) => window.addEventListener(evt, fn),
  };

  // ==============================================================
  // HELPERS
  // ==============================================================
  const $  = (sel, r = document) => r.querySelector(sel);
  const $$ = (sel, r = document) => [...r.querySelectorAll(sel)];
  const debounce = (fn, ms = 220) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  const escapeHTML = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  const fmtNum = (n, d = 2) => {
    if (n == null || Number.isNaN(+n)) return '—';
    const v = +n;
    if (Math.abs(v) >= 1e12) return (v/1e12).toFixed(2) + 'T';
    if (Math.abs(v) >= 1e9)  return (v/1e9).toFixed(2)  + 'B';
    if (Math.abs(v) >= 1e6)  return (v/1e6).toFixed(2)  + 'M';
    if (Math.abs(v) >= 1e3)  return (v/1e3).toFixed(2)  + 'K';
    return v.toFixed(d);
  };
  const fmtPrice = (n) => (n == null ? '—' : (+n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const fmtPct   = (n) => (n == null ? '—' : (n >= 0 ? '+' : '') + (+n).toFixed(2) + '%');

  const hhmm = (iso) => {
    if (!iso) return '--:--';
    const d = new Date(iso);
    if (isNaN(d)) return '--:--';
    return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
  };
  const ago = (iso) => {
    if (!iso) return '';
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60)    return s + 's';
    if (s < 3600)  return Math.floor(s/60) + 'm';
    if (s < 86400) return Math.floor(s/3600) + 'h';
    return Math.floor(s/86400) + 'd';
  };

  const toast = (msg, type = '') => {
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), 3600);
  };

  const setStatus = (cls, label) => {
    const dot = $('#statusDot');
    dot.className = 'status ' + cls;
    $('.status__label', dot).textContent = label;
  };

  // ==============================================================
  // FMP CLIENT
  // ==============================================================
  async function fmp(path, params = {}) {
    if (!state.apiKey) throw new Error('Missing FMP API key');
    const url = new URL(FMP_BASE + path);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    }
    url.searchParams.set('apikey', state.apiKey);
    setStatus('is-loading', 'SYNC');
    state.reqCount++;
    updateReqStats();
    try {
      const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
      if (res.status === 401 || res.status === 403) { setStatus('is-error', 'AUTH'); throw new Error('Invalid or unauthorized FMP API key'); }
      if (res.status === 429) { setStatus('is-error', 'RATE'); throw new Error('FMP rate limit reached'); }
      if (!res.ok) { setStatus('is-error', 'ERR'); throw new Error('FMP request failed (' + res.status + ')'); }
      const json = await res.json();
      if (json && !Array.isArray(json) && json['Error Message']) throw new Error(json['Error Message']);
      setStatus('is-live', 'LIVE');
      return json;
    } catch (err) {
      state.errCount++;
      updateReqStats();
      throw err;
    }
  }

  const api = {
    searchSymbol: (q)         => fmp('/search-symbol', { query: q, limit: 8 }),
    searchName:   (q)         => fmp('/search-name',   { query: q, limit: 8 }),
    quote:        (symbol)    => fmp('/quote',         { symbol }),
    batchQuote:   (symbols)   => fmp('/batch-quote',   { symbols: symbols.join(',') }),
    stockLatest:  (page, lim) => fmp('/news/stock-latest',          { page, limit: lim }),
    stockNews:    (sym, p, l) => fmp('/news/stock',                 { symbols: sym, page: p, limit: l }),
    generalNews:  (page, lim) => fmp('/news/general-latest',        { page, limit: lim }),
    pressLatest:  (page, lim) => fmp('/news/press-releases-latest', { page, limit: lim }),
    pressForSym:  (sym, p, l) => fmp('/news/press-releases',        { symbols: sym, page: p, limit: l }),
    articles:     (page, lim) => fmp('/fmp-articles',               { page, limit: lim }),
  };

  // ==============================================================
  // PERSISTENCE
  // ==============================================================
  const loadKey  = () => localStorage.getItem(STORAGE.key) || sessionStorage.getItem(STORAGE.key);
  const saveKey  = (k, persist) => {
    if (persist) { localStorage.setItem(STORAGE.key, k); sessionStorage.removeItem(STORAGE.key); }
    else { sessionStorage.setItem(STORAGE.key, k); localStorage.removeItem(STORAGE.key); }
  };
  const clearKey = () => { localStorage.removeItem(STORAGE.key); sessionStorage.removeItem(STORAGE.key); };

  const loadWatchlist = () => {
    try { return JSON.parse(localStorage.getItem(STORAGE.watchlist)) || ['AAPL','TSLA','NVDA','SPY','QQQ']; }
    catch { return ['AAPL','TSLA','NVDA','SPY','QQQ']; }
  };
  const saveWatchlist = () => localStorage.setItem(STORAGE.watchlist, JSON.stringify(state.watchlist));

  // ==============================================================
  // KEYWORD TAGGING
  // ==============================================================
  // Classify a headline into one of: BREAKING · EARNINGS · UPGRADE · DOWNGRADE · M&A · SEC · GUIDANCE · NEWS
  const TAG_PATTERNS = [
    { tag: 'BREAKING',  re: /\b(breaking|just in|alert|halted|suspend(ed)?|plunge|soars|surge|crash|rally)\b/i },
    { tag: 'EARNINGS',  re: /\b(earnings|eps|revenue|q[1-4]\s?20\d{2}|beat(s)? estimates|miss(es|ed)? estimates|reported|quarterly (results|report))\b/i },
    { tag: 'GUIDANCE',  re: /\b(guidance|outlook|forecast|raises|lowers|cut(s)? forecast|raise(s|d)? forecast|fy\s?20\d{2})\b/i },
    { tag: 'UPGRADE',   re: /\b(upgrade[sd]?|raises? (price target|pt)|initiates? (coverage )?with buy|outperform|overweight)\b/i },
    { tag: 'DOWNGRADE', re: /\b(downgrade[sd]?|cuts? (price target|pt)|underperform|underweight|sell rating)\b/i },
    { tag: 'MA',        re: /\b(acquires?|acquisition|merger|to buy|takeover|tender offer|divest(iture)?|spin[- ]?off)\b/i },
    { tag: 'SEC',       re: /\b(sec |securities and exchange|8[- ]?k|10[- ]?[kq]|s[- ]?1|13[- ]?[dg]|filing|files with|prospectus|ipo)\b/i },
  ];
  function classify(headline) {
    const t = (headline || '').toLowerCase();
    for (const { tag, re } of TAG_PATTERNS) if (re.test(t)) return tag;
    return 'NEWS';
  }

  // ==============================================================
  // NORMALIZER
  // ==============================================================
  function normalize(raw, idx = 0) {
    const title  = raw.title || raw.headline || '';
    const text   = raw.text || raw.snippet || raw.content || raw.description || '';
    const url    = raw.url || raw.link || '#';
    const image  = raw.image || raw.thumbnail || '';
    const site   = raw.site || raw.publisher || raw.source || 'FMP';
    const date   = raw.publishedDate || raw.date || raw.updatedAt || '';
    let symbol   = raw.symbol || raw.tickers || '';
    if (Array.isArray(symbol)) symbol = symbol[0] || '';
    // synthetic id — used for dedup/new detection
    const id = (url && url !== '#' ? url : (title + '|' + date)) || String(idx);
    return { id, title, text, url, image, site, symbol, date, tag: classify(title + ' ' + text) };
  }

  // ==============================================================
  // UI: MODAL
  // ==============================================================
  function openKeyModal()  { $('#apiModal').style.display = 'grid'; $('#app').hidden = true; setTimeout(() => $('#apiKeyInput').focus(), 50); }
  function closeKeyModal() { $('#apiModal').style.display = 'none'; $('#app').hidden = false; }

  $('#apiForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const key = $('#apiKeyInput').value.trim();
    if (!key) return;
    const persist = $('#rememberKey').checked;
    state.apiKey = key;
    try {
      setStatus('is-loading', 'AUTH');
      await fmp('/quote', { symbol: 'AAPL' });
      saveKey(key, persist);
      toast('API key connected', 'success');
      closeKeyModal();
      init();
    } catch (err) {
      state.apiKey = null;
      toast(err.message || 'Key verification failed', 'error');
      setStatus('is-error', 'AUTH');
    }
  });

  $('#resetKeyBtn').addEventListener('click', () => {
    clearKey();
    state.apiKey = null;
    stopStream();
    if (state.tickerTimer) clearInterval(state.tickerTimer);
    openKeyModal();
  });

  // ==============================================================
  // UI: SEARCH + SUGGESTIONS
  // ==============================================================
  const searchInput   = $('#searchInput');
  const suggestionsEl = $('#suggestions');
  let suggestIdx = -1;
  let suggestItems = [];

  const runSuggest = debounce(async (q) => {
    if (!q) { hideSuggest(); return; }
    try {
      const [bySym, byName] = await Promise.all([
        api.searchSymbol(q).catch(() => []),
        api.searchName(q).catch(() => []),
      ]);
      const map = new Map();
      [...(bySym||[]), ...(byName||[])].forEach((it) => {
        if (it && it.symbol && !map.has(it.symbol)) map.set(it.symbol, it);
      });
      suggestItems = [...map.values()].slice(0, 8);
      if (!suggestItems.length) { hideSuggest(); return; }
      suggestionsEl.innerHTML = suggestItems.map((it, i) => `
        <div class="suggestion ${i === suggestIdx ? 'is-active' : ''}" data-index="${i}" data-symbol="${escapeHTML(it.symbol)}">
          <span class="suggestion__sym">${escapeHTML(it.symbol)}</span>
          <span class="suggestion__name">${escapeHTML(it.name || '')}</span>
          <span class="suggestion__exch">${escapeHTML(it.exchangeShortName || it.exchange || '')}</span>
        </div>
      `).join('');
      suggestionsEl.hidden = false;
    } catch { hideSuggest(); }
  }, 220);

  function hideSuggest() { suggestionsEl.hidden = true; suggestionsEl.innerHTML = ''; suggestIdx = -1; suggestItems = []; }

  searchInput.addEventListener('input', (e) => { suggestIdx = -1; runSuggest(e.target.value.trim()); });
  searchInput.addEventListener('focus', () => { if (suggestionsEl.innerHTML) suggestionsEl.hidden = false; });
  document.addEventListener('click', (e) => {
    if (!suggestionsEl.contains(e.target) && e.target !== searchInput) hideSuggest();
  });
  suggestionsEl.addEventListener('click', (e) => {
    const el = e.target.closest('.suggestion');
    if (!el) return;
    selectSymbol(el.dataset.symbol);
    hideSuggest();
    searchInput.value = el.dataset.symbol;
    searchInput.blur();
  });

  // In-input arrow navigation for suggestions
  searchInput.addEventListener('keydown', (e) => {
    if (suggestionsEl.hidden || !suggestItems.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      suggestIdx = (suggestIdx + 1) % suggestItems.length;
      renderSuggestActive();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      suggestIdx = (suggestIdx - 1 + suggestItems.length) % suggestItems.length;
      renderSuggestActive();
    } else if (e.key === 'Enter' && suggestIdx >= 0) {
      e.preventDefault();
      const sym = suggestItems[suggestIdx].symbol;
      selectSymbol(sym);
      searchInput.value = sym;
      hideSuggest();
      searchInput.blur();
    }
  });
  function renderSuggestActive() {
    $$('.suggestion', suggestionsEl).forEach((el, i) => el.classList.toggle('is-active', i === suggestIdx));
  }

  $('#searchForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = searchInput.value.trim().toUpperCase();
    if (!q) return;
    hideSuggest();
    selectSymbol(q);
    searchInput.blur();
  });

  // ==============================================================
  // UI: TABS & FILTERS
  // ==============================================================
  $$('.feedtab').forEach((btn) => btn.addEventListener('click', () => switchFeed(btn.dataset.feed)));
  $$('.pill').forEach((btn) => btn.addEventListener('click', () => {
    state.filter = btn.dataset.tag;
    localStorage.setItem(STORAGE.filter, state.filter);
    $$('.pill').forEach((b) => b.classList.toggle('is-active', b.dataset.tag === state.filter));
    renderFeed();
  }));
  $$('.chip').forEach((c) => c.addEventListener('click', () => selectSymbol(c.dataset.symbol)));

  function switchFeed(feed) {
    state.feed = feed;
    localStorage.setItem(STORAGE.feed, feed);
    $$('.feedtab').forEach((b) => b.classList.toggle('is-active', b.dataset.feed === feed));
    resetAndLoad();
  }

  // ==============================================================
  // UI: BUTTONS
  // ==============================================================
  $('#refreshBtn').addEventListener('click', () => resetAndLoad());
  $('#loadMoreBtn').addEventListener('click', () => loadNews({ append: true }));
  $('#newBadge').addEventListener('click', () => {
    state.pendingNew = 0;
    $('#newBadge').hidden = true;
    $('#newsList').scrollTo({ top: 0, behavior: 'smooth' });
  });

  $('#addWatchBtn').addEventListener('click', addCurrentToWatchlist);
  function addCurrentToWatchlist() {
    if (!state.symbol) { toast('Search a symbol first', 'error'); return; }
    if (state.watchlist.includes(state.symbol)) { toast('Already in watchlist'); return; }
    state.watchlist.unshift(state.symbol);
    saveWatchlist();
    renderWatchlist();
    refreshTicker();
  }

  // Mini refresh buttons
  $$('[data-mini-refresh]').forEach((b) => b.addEventListener('click', () => loadMini(b.dataset.miniRefresh)));

  // Stream toggle
  $('#autoStream').addEventListener('change', (e) => {
    state.stream = e.target.checked;
    localStorage.setItem(STORAGE.stream, state.stream ? '1' : '0');
    if (state.stream) startStream(); else stopStream();
  });

  // Help
  $('#helpBtn').addEventListener('click', () => $('#helpOverlay').hidden = false);
  $('#helpClose').addEventListener('click', () => $('#helpOverlay').hidden = true);
  $('#helpOverlay').addEventListener('click', (e) => { if (e.target.id === 'helpOverlay') e.currentTarget.hidden = true; });

  // ==============================================================
  // UI: WATCHLIST
  // ==============================================================
  function renderWatchlist() {
    const ul = $('#watchlist');
    if (!state.watchlist.length) { ul.innerHTML = '<li class="watchlist__empty">Empty · press A to add</li>'; return; }
    ul.innerHTML = state.watchlist.map((s) => `
      <li class="watch-item" data-symbol="${escapeHTML(s)}">
        <span class="watch-item__sym">${escapeHTML(s)}</span>
        <span class="watch-item__chg" data-chg="${escapeHTML(s)}">—</span>
        <button class="watch-item__remove" data-remove="${escapeHTML(s)}" title="Remove">×</button>
      </li>
    `).join('');
    $$('.watch-item', ul).forEach((el) => el.addEventListener('click', (e) => {
      if (e.target.closest('[data-remove]')) return;
      selectSymbol(el.dataset.symbol);
    }));
    $$('[data-remove]', ul).forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      const s = b.dataset.remove;
      state.watchlist = state.watchlist.filter((x) => x !== s);
      saveWatchlist();
      renderWatchlist();
      refreshTicker();
    }));
  }

  // ==============================================================
  // FEED LOGIC
  // ==============================================================
  function feedTitle() {
    const s = state.symbol;
    switch (state.feed) {
      case 'stock':    return s ? `STOCK NEWS · ${s}`  : 'STOCK NEWS · LATEST';
      case 'general':  return 'MACRO · LATEST';
      case 'press':    return s ? `PRESS · ${s}`       : 'PRESS RELEASES · LATEST';
      case 'articles': return 'FMP ARTICLES';
    }
    return '';
  }

  async function fetchFeed(page) {
    const s = state.symbol;
    switch (state.feed) {
      case 'stock':    return s ? api.stockNews(s, page, PAGE_SIZE)  : api.stockLatest(page, PAGE_SIZE);
      case 'general':  return api.generalNews(page, PAGE_SIZE);
      case 'press':    return s ? api.pressForSym(s, page, PAGE_SIZE) : api.pressLatest(page, PAGE_SIZE);
      case 'articles': return api.articles(page, PAGE_SIZE);
    }
    return [];
  }

  function filterItems(items) {
    if (state.filter === 'ALL') return items;
    const f = state.filter === 'M&A' ? 'MA' : state.filter;
    return items.filter((it) => it.tag === f);
  }

  function renderFeed() {
    const list = $('#newsList');
    $('#feedTitle').textContent = feedTitle();
    $('#feedCount').textContent = state.items.length;

    const filtered = filterItems(state.items);
    if (!filtered.length && !state.loading) {
      list.innerHTML = `<div class="empty">NO HEADLINES MATCH · TRY ANOTHER FILTER OR FEED</div>`;
      return;
    }

    list.innerHTML = filtered.map((a, i) => {
      const tagClass = a.tag === 'MA' ? 'MA' : a.tag;
      const symLabel = a.symbol ? escapeHTML(Array.isArray(a.symbol) ? a.symbol[0] : a.symbol) : '—';
      const symClass = a.symbol ? '' : 'is-empty';
      const newCls   = a._isNew ? 'is-new' : '';
      const selCls   = i === state.selectedIndex ? 'is-selected' : '';
      return `
        <div class="row ${newCls} ${selCls}" data-index="${i}" data-url="${escapeHTML(a.url)}" data-symbol="${escapeHTML(a.symbol || '')}">
          <span class="row__time">${escapeHTML(hhmm(a.date))}</span>
          <span class="row__ago">${escapeHTML(ago(a.date))}</span>
          <span class="row__sym ${symClass}">${symLabel}</span>
          <span class="row__tag row__tag--${tagClass}">${escapeHTML(a.tag)}</span>
          <span class="row__headline">${escapeHTML(a.title || '(no title)')}</span>
          <span class="row__site">${escapeHTML((a.site || '').slice(0, 12))}</span>
        </div>
      `;
    }).join('');

    $$('.row', list).forEach((el) => {
      el.addEventListener('click', () => {
        state.selectedIndex = +el.dataset.index;
        highlightSelected();
        // Also update quote if symbol present
        const sym = el.dataset.symbol;
        if (sym) selectSymbol(sym.toUpperCase(), { silent: true });
      });
      el.addEventListener('dblclick', () => window.open(el.dataset.url, '_blank', 'noopener'));
    });

    // Feed meta
    $('#feedMeta').textContent =
      `${filtered.length}/${state.items.length} items · ${state.filter}`;
  }

  function highlightSelected() {
    $$('.row').forEach((el, i) => el.classList.toggle('is-selected', i === state.selectedIndex));
    const el = $(`.row[data-index="${state.selectedIndex}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }

  function renderSkeleton() {
    $('#newsList').innerHTML = Array.from({ length: 8 }).map(() => `<div class="skel skel-row"></div>`).join('');
  }

  async function loadNews({ append = false } = {}) {
    if (state.loading) return;
    state.loading = true;
    if (!append) { state.page = 0; renderSkeleton(); }
    else state.page += 1;

    try {
      const data = await fetchFeed(state.page);
      const arr  = Array.isArray(data) ? data : [];
      const normalized = arr.map((r, i) => normalize(r, i));

      if (append) {
        state.items = state.items.concat(normalized.filter((n) => !state.knownIds.has(n.id)));
      } else {
        state.items = normalized;
        state.knownIds = new Set(normalized.map((n) => n.id));
        state.selectedIndex = -1;
        state.pendingNew = 0;
        $('#newBadge').hidden = true;
      }
      normalized.forEach((n) => state.knownIds.add(n.id));

      renderFeed();
      $('#lastUpdate').textContent = 'Updated ' + new Date().toLocaleTimeString('en-US', { hour12: false });
    } catch (err) {
      toast(err.message || 'Feed failed', 'error');
      $('#newsList').innerHTML = `<div class="error">${escapeHTML((err.message || 'Failed').toUpperCase())}</div>`;
    } finally {
      state.loading = false;
    }
  }

  function resetAndLoad() { loadNews({ append: false }); }

  // ==============================================================
  // STREAMING (auto-poll + diff + flash)
  // ==============================================================
  async function streamTick() {
    if (!state.apiKey) return;
    try {
      const data = await fetchFeed(0);
      const arr  = Array.isArray(data) ? data : [];
      const normalized = arr.map((r, i) => normalize(r, i));
      const fresh = normalized.filter((n) => !state.knownIds.has(n.id));
      if (fresh.length) {
        fresh.forEach((n) => { n._isNew = true; state.knownIds.add(n.id); });
        // Prepend fresh to items
        state.items = fresh.concat(state.items);
        state.pendingNew += fresh.length;
        $('#newBadge').hidden = false;
        $('#newBadge').textContent = `${state.pendingNew} NEW`;
        renderFeed();
        // Clear the "is-new" after animation so subsequent renders don't re-flash
        setTimeout(() => {
          state.items.forEach((n) => n._isNew = false);
        }, 2000);
      }
      $('#lastUpdate').textContent = 'Updated ' + new Date().toLocaleTimeString('en-US', { hour12: false });
    } catch (err) {
      // stay silent on stream errors to avoid toast spam
      console.warn('[stream]', err.message);
    }
  }

  function startStream() {
    stopStream();
    if (!state.stream) return;
    state.nextPollAt = Date.now() + STREAM_INTERVAL;
    state.streamTimer = setInterval(() => { state.nextPollAt = Date.now() + STREAM_INTERVAL; streamTick(); }, STREAM_INTERVAL);
  }
  function stopStream() {
    if (state.streamTimer) clearInterval(state.streamTimer);
    state.streamTimer = null;
  }

  // Countdown tick (updates "Next poll: 12s")
  setInterval(() => {
    const el = $('#nextPoll');
    if (!el) return;
    if (!state.stream || !state.streamTimer) { el.textContent = 'off'; return; }
    const s = Math.max(0, Math.round((state.nextPollAt - Date.now()) / 1000));
    el.textContent = s + 's';
  }, 1000);

  // ==============================================================
  // QUOTE + CHART HOOK
  // ==============================================================
  async function loadQuote(symbol) {
    const card = $('#quoteCard');
    card.innerHTML = `
      <div class="skel" style="height: 20px; width: 50%"></div>
      <div class="skel" style="height: 32px; width: 70%; margin-top: 12px"></div>
      <div class="skel" style="height: 14px; width: 40%; margin-top: 8px"></div>
      <div class="skel" style="height: 100px; width: 100%; margin-top: 14px"></div>
    `;
    try {
      const data = await api.quote(symbol);
      const q = Array.isArray(data) ? data[0] : data;
      if (!q || !q.symbol) {
        card.innerHTML = `<div class="error">NO QUOTE · ${escapeHTML(symbol)}</div>`;
        return;
      }
      const chg = q.change ?? 0;
      const pct = q.changePercentage ?? q.changesPercentage ?? 0;
      const up  = chg >= 0;
      card.innerHTML = `
        <div class="quote__head">
          <div>
            <div class="quote__sym">${escapeHTML(q.symbol)}</div>
            <div class="quote__name">${escapeHTML(q.name || '')}</div>
          </div>
          <div class="quote__exch">${escapeHTML(q.exchange || '')}</div>
        </div>
        <div class="quote__price">$${fmtPrice(q.price)}</div>
        <div class="quote__change ${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${fmtPrice(Math.abs(chg))} · ${fmtPct(pct)}</div>
        <div class="quote__stats">
          <div class="stat"><div class="stat__label">DAY LOW</div><div class="stat__value">$${fmtPrice(q.dayLow)}</div></div>
          <div class="stat"><div class="stat__label">DAY HIGH</div><div class="stat__value">$${fmtPrice(q.dayHigh)}</div></div>
          <div class="stat"><div class="stat__label">52W LOW</div><div class="stat__value">$${fmtPrice(q.yearLow)}</div></div>
          <div class="stat"><div class="stat__label">52W HIGH</div><div class="stat__value">$${fmtPrice(q.yearHigh)}</div></div>
          <div class="stat"><div class="stat__label">VOLUME</div><div class="stat__value">${fmtNum(q.volume, 0)}</div></div>
          <div class="stat"><div class="stat__label">AVG VOL</div><div class="stat__value">${fmtNum(q.avgVolume, 0)}</div></div>
          <div class="stat"><div class="stat__label">MKT CAP</div><div class="stat__value">$${fmtNum(q.marketCap, 0)}</div></div>
          <div class="stat"><div class="stat__label">P/E</div><div class="stat__value">${q.pe != null ? (+q.pe).toFixed(2) : '—'}</div></div>
        </div>
      `;
    } catch (err) {
      card.innerHTML = `<div class="error">${escapeHTML((err.message || 'QUOTE FAILED').toUpperCase())}</div>`;
    }
  }

  function updateChartHook(symbol) {
    $('#chartSym').textContent = symbol || '—';
    // Fire a custom event the TradingOS shell can listen to and mount DXCharts into #chartHook
    window.dispatchEvent(new CustomEvent('tradingos:symbol', { detail: { symbol, mount: $('#chartHook') } }));
  }

  // ==============================================================
  // TICKER TAPE
  // ==============================================================
  async function refreshTicker() {
    const bar = $('#tickerTape');
    const symbols = state.watchlist.slice(0, 16);
    if (!symbols.length) { bar.innerHTML = '<span class="muted mono" style="padding:4px 8px;font-size:11px">WATCHLIST EMPTY</span>'; return; }
    try {
      const data = await api.batchQuote(symbols);
      const arr = Array.isArray(data) ? data : [];
      const map = new Map(arr.map((q) => [q.symbol, q]));
      bar.innerHTML = symbols.map((s) => {
        const q = map.get(s);
        if (!q) return `<div class="tape-item" data-symbol="${escapeHTML(s)}"><span class="tape-item__sym">${escapeHTML(s)}</span><span class="tape-item__price">—</span></div>`;
        const pct = q.changePercentage ?? q.changesPercentage ?? 0;
        const up  = (q.change ?? 0) >= 0;
        return `
          <div class="tape-item" data-symbol="${escapeHTML(s)}">
            <span class="tape-item__sym">${escapeHTML(s)}</span>
            <span class="tape-item__price">$${fmtPrice(q.price)}</span>
            <span class="tape-item__chg ${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${fmtPct(pct)}</span>
          </div>
        `;
      }).join('');
      $$('.tape-item', bar).forEach((el) => el.addEventListener('click', () => selectSymbol(el.dataset.symbol)));
      // Watchlist chg column
      state.watchlist.forEach((s) => {
        const q = map.get(s);
        const el = $(`[data-chg="${CSS.escape(s)}"]`);
        if (!el || !q) return;
        const pct = q.changePercentage ?? q.changesPercentage ?? 0;
        const up  = (q.change ?? 0) >= 0;
        el.textContent = fmtPct(pct);
        el.style.color = up ? 'var(--up)' : 'var(--down)';
      });
    } catch (err) {
      bar.innerHTML = `<span class="muted mono" style="padding:4px 8px;font-size:11px">${escapeHTML((err.message || 'tape unavailable').toUpperCase())}</span>`;
    }
  }

  // ==============================================================
  // MINI FEEDS (right stack)
  // ==============================================================
  async function loadMini(kind) {
    const id = kind === 'press' ? 'miniPress' : 'miniGeneral';
    const el = $('#' + id);
    el.innerHTML = Array.from({ length: 4 }).map(() => '<li class="skel skel-row" style="margin:6px 12px"></li>').join('');
    try {
      const data = kind === 'press' ? await api.pressLatest(0, MINI_SIZE) : await api.generalNews(0, MINI_SIZE);
      const arr = Array.isArray(data) ? data : [];
      const items = arr.map((r, i) => normalize(r, i));
      if (!items.length) { el.innerHTML = '<li class="empty" style="margin:8px">NO ITEMS</li>'; return; }
      el.innerHTML = items.map((a) => `
        <li class="mini-row" data-url="${escapeHTML(a.url)}">
          <span class="mini-row__time">${escapeHTML(hhmm(a.date))}</span>
          <span class="mini-row__text">${escapeHTML(a.title)}</span>
        </li>
      `).join('');
      $$('.mini-row', el).forEach((row) => row.addEventListener('click', () => window.open(row.dataset.url, '_blank', 'noopener')));
    } catch (err) {
      el.innerHTML = `<li class="error" style="margin:8px">${escapeHTML((err.message || 'failed').toUpperCase())}</li>`;
    }
  }

  // ==============================================================
  // SELECT SYMBOL ORCHESTRATION
  // ==============================================================
  function selectSymbol(symbol, opts = {}) {
    if (!symbol) return;
    state.symbol = symbol.toUpperCase();
    if (!opts.silent) searchInput.value = state.symbol;
    loadQuote(state.symbol);
    updateChartHook(state.symbol);
    if (state.feed === 'stock' || state.feed === 'press') resetAndLoad();
  }

  // ==============================================================
  // KEYBOARD SHORTCUTS
  // ==============================================================
  function isTypingInInput(target) {
    if (!target) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
  }

  document.addEventListener('keydown', (e) => {
    // Help overlay close
    if (!$('#helpOverlay').hidden && e.key === 'Escape') { $('#helpOverlay').hidden = true; return; }

    // Escape: blur input / close suggestions
    if (e.key === 'Escape') {
      hideSuggest();
      if (document.activeElement === searchInput) searchInput.blur();
      return;
    }

    // "/" focuses search (works even when typing elsewhere? No — only when NOT typing)
    if (e.key === '/' && !isTypingInInput(e.target)) {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
      return;
    }

    // Don't intercept when user is typing in search or any input
    if (isTypingInInput(e.target)) return;

    switch (e.key) {
      case 'j':
      case 'ArrowDown':
        if (e.shiftKey || e.metaKey || e.ctrlKey) return;
        e.preventDefault();
        state.selectedIndex = Math.min(state.items.length - 1, state.selectedIndex + 1);
        highlightSelected();
        break;
      case 'k':
      case 'ArrowUp':
        if (e.shiftKey || e.metaKey || e.ctrlKey) return;
        e.preventDefault();
        state.selectedIndex = Math.max(0, state.selectedIndex - 1);
        highlightSelected();
        break;
      case 'Enter': {
        const el = $(`.row[data-index="${state.selectedIndex}"]`);
        if (el) window.open(el.dataset.url, '_blank', 'noopener');
        break;
      }
      case 'c': {
        const el = $(`.row[data-index="${state.selectedIndex}"]`);
        if (el && el.dataset.symbol) selectSymbol(el.dataset.symbol.toUpperCase());
        break;
      }
      case '1': switchFeed('stock');    break;
      case '2': switchFeed('general');  break;
      case '3': switchFeed('press');    break;
      case '4': switchFeed('articles'); break;
      case 'r': resetAndLoad();         break;
      case 'a': addCurrentToWatchlist();break;
      case 's': {
        const cb = $('#autoStream');
        cb.checked = !cb.checked;
        cb.dispatchEvent(new Event('change'));
        break;
      }
      case '?':
        $('#helpOverlay').hidden = false;
        break;
    }
  });

  // ==============================================================
  // CLOCK + REQ STATS
  // ==============================================================
  function tickClock() {
    const now = new Date();
    const utc = now.toISOString().substring(11, 19);
    const loc = now.toLocaleTimeString('en-US', { hour12: false });
    $('#clock').textContent = `${loc} · ${utc} UTC`;
  }
  function updateReqStats() {
    $('#reqCount').textContent = state.reqCount;
    $('#errCount').textContent = state.errCount;
  }
  setInterval(tickClock, 1000); tickClock();

  // ==============================================================
  // BOOT
  // ==============================================================
  async function init() {
    // Restore preferences
    const savedFeed = localStorage.getItem(STORAGE.feed);
    if (savedFeed) { state.feed = savedFeed; $$('.feedtab').forEach((b) => b.classList.toggle('is-active', b.dataset.feed === savedFeed)); }
    const savedFilter = localStorage.getItem(STORAGE.filter);
    if (savedFilter) { state.filter = savedFilter; $$('.pill').forEach((b) => b.classList.toggle('is-active', b.dataset.tag === savedFilter)); }
    const savedStream = localStorage.getItem(STORAGE.stream);
    if (savedStream !== null) { state.stream = savedStream === '1'; $('#autoStream').checked = state.stream; }

    state.watchlist = loadWatchlist();
    renderWatchlist();

    await Promise.all([
      loadNews(),
      loadMini('general'),
      loadMini('press'),
      refreshTicker(),
    ]);

    if (state.tickerTimer) clearInterval(state.tickerTimer);
    state.tickerTimer = setInterval(refreshTicker, TICKER_INTERVAL);
    if (state.stream) startStream();
  }

  // ==============================================================
  // BOOTSTRAP
  // ==============================================================
  const existing = loadKey();
  if (existing) {
    state.apiKey = existing;
    closeKeyModal();
    init();
  } else {
    openKeyModal();
  }
})();
