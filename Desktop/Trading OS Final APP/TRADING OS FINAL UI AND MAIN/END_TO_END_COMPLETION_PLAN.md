# End-to-end completion plan (Trading OS)

**Phase 0 — execution map.** Each row is one domain. Update this file as phases complete.

| Domain | Current status | Files involved | Adapter / surface | What must be done | Completable now? | Blocker |
|--------|----------------|----------------|-------------------|-------------------|------------------|---------|
| **Chart** | Live when `VITE_USE_ENGINE_EDGE=true`: `TradingTerminal` → `getTradingAdapter().getChart` | `src/pages/Chart.tsx`, `src/features/trading-terminal/components/TradingTerminal.jsx`, `src/engine/services/chartService.ts`, `src/engine/chartSymbolRouting.ts` | `getTradingAdapter().getChart` | Pair coverage, degraded copy, proof rows (Phase 1) | **Yes** | None |
| **WebSocket live chart** | Cloudflare `LiveEngineClient` subscribes when `VITE_LIVE_ENGINE_WS_URL` + edge chart path | `TradingTerminal.jsx`, `src/lib/realtime/LiveEngineClient.ts`, `cloudflare/live-engine/src/room.ts` | WS only; history via HTTP | Smoke proof in Engine Ops; bucket logic already in worker | **Yes** | Worker URL / upstream keys if handshake fails |
| **Top shell** | Global top bar + ticker; Edge/WS hint on desktop | `Layout.tsx`, `GlobalTopBar.tsx`, `TickerBar.tsx` | Contexts + navigate | Phase 2: env strip + ticker → chart | **Yes** | Squawk/breaking still placeholder |
| **News** | `adapter.news` via engine-proxy when edge | `engineAdapterLegacy`, `remoteEngineAdapter`, `engine-proxy` | `getTradingAdapter().news` | Leave for later phase per user | Yes | FMP/Perigon secrets |
| **Scanner / Heatmap** | `getScannerResults`, heatmap snapshot | `engineAdapterLegacy`, pages | `getTradingAdapter().getScannerResults` | Ops proof exists; page QA later | Yes | Provider limits |
| **Macro** | `macroSeries` via adapter | `MacroTerminal.tsx`, `TradingTerminal` macro panel | `macroSeries` | FRED keys; already in proof | Yes | FRED_* |
| **Intel** | Jets + intel-proxy; some stubs | `intel-proxy`, intel pages | `corporateJets`, `callIntelProxy` | Later phase | Yes | OPENSKY/AISSTREAM/FMP |
| **Main** | Dashboard hub | `src/pages/Main.tsx` | `getTradingAdapter()` | Accounts/watchlist when signed in | Partial | Auth |
| **AXE** | Companion page | `AxeCompanion.tsx` | Adapter | Later | Partial | Chart for axe symbol |
| **Auth / Onboarding** | Supabase + onboarding fn | `Onboarding.tsx`, `auth` flows | `fetchOnboardingOptions` (JWT) | Session + options | Yes | User must sign in for JWT-only paths |
| **Watchlists** | `WatchlistContext` + top bar + chart strip | `WatchlistContext.tsx`, `GlobalTopBar.tsx`, `Chart.tsx`, `terminalSymbolBridge.ts` | localStorage groups; Main uses `getWatchlist` when signed in | Phase 2: display normalize + chart slot | **Yes** | Server watchlist merge optional |
| **Alerts** | REST CRUD when `VITE_TRADING_TERMINAL_API_URL`; WS triggers when Python WS | `AlertPanel.jsx`, `TradingTerminal.jsx` | Legacy `/api/alerts` | Phase 2: degraded UX without REST | **Yes** | No engine-proxy price alerts yet |
| **Notes** | Browser `localStorage` via `tradingNotesStore` | `src/lib/tradingNotesStore.ts`, `JournalWorkspace.tsx` | None | Phase 3 workspace | **Yes** | Cloud sync later |
| **Trading Journal** | Same + MAIN preview | `tradingJournalStore.ts`, `Main.tsx`, `JournalWorkspace.tsx` | None | Phase 3 | **Yes** | Server-backed journal later |
| **Accounts / Positions** | Main + adapter when signed in | `Main.tsx`, facade | `getTradingAdapter()` account methods | Real broker / demo | Partial | Execution backend |
| **MT5 bridge** | Execution bridge UI stub paths | `ExecutionBridge` | — | Integration spec | No | MT5 deployment + protocol |
| **Execution bridge** | UI component in terminal | `ExecutionBridge.jsx` | — | Same as MT5 / REST | No | Broker API |
| **Beginner Mode** | TBD / settings | `Settings.tsx` | — | UX flag + simplified nav | Partial | Product spec |
| **Mobile** | Responsive pass | Global CSS / layouts | — | Audit breakpoints | Partial | — |
| **Engine Ops** | Dashboard + live proof | `EngineOps.tsx`, `runEngineOpsLiveProof` | Same as production | Chart pair proof rows + WS smoke (Phase 1) | **Yes** | None |

---

## Phase 1 — Chart + pair coverage

- Confirm `Chart` page → `TradingTerminal` uses `getTradingAdapter().getChart` when edge data flag is on.
- Default symbol `XAU/USD` via `SymbolContext`.
- Yahoo chart chain only when `ENABLE_YAHOO_CHART_FALLBACK` / `VITE_ENABLE_YAHOO_CHART_FALLBACK=true`.
- Engine Ops proof: `getChart` for XAUUSD, EURUSD, BTCUSD; optional WS handshake row for XAUUSD 1D.
- Terminal: clearer **degraded / unsupported** message on `ChartFetchError` without layout changes.

### Phase 1 done (code)

- `runEngineOpsLiveProof`: three `getChart` rows (XAUUSD, EURUSD, BTCUSD) + `liveEngineWs(XAUUSD,1D handshake)` row.
- `TradingTerminal.jsx`: degraded/empty-series copy; `BTCUSD` in `ENGINE_PAIRS.stocks` for local engine pair list.
- `EngineOps.tsx`: stable table row keys; tip text aligned with anon Bearer for public engine reads.

## Phase 2 — Top shell + watchlist + alerts (done in code)

- **GlobalTopBar:** Watchlist tabs deduped + normalized to slash display (aligned with `SymbolContext`); default `ALL` target **XAU/USD** when list empty; compact **Edge / WS** env indicator (replaces static “Synced”).
- **terminalSymbolBridge:** `TERMINAL_TO_DISPLAY` prefers slash labels so `XAUUSD` → `XAU/USD`.
- **Chart page:** `watchlistSlot` on `TradingTerminal` reuses same watchlist symbols as top bar (quick pair switch inside chart).
- **TickerBar:** Click a slash-pair or raw watchlist symbol → `setSymbol` + navigate to `/chart`.
- **Alerts:** `AlertPanel` + `fetchAlertCount` handle missing `VITE_TRADING_TERMINAL_API_URL` with degraded copy; create/delete disabled without REST API.

## Phase 3 — Notes + Trading Journal (done in code)

- **Route:** `/journal` → `JournalWorkspace` (tabs: Notes | Trade journal). Linked from **Sidebar** + **Mobile → More**.
- **Storage:** `tradingos.notes.entries.v1` and `tradingos.journal.entries.v1` in `localStorage`; `CustomEvent('tos-journal-changed')` refreshes MAIN when entries change.
- **MAIN:** Journal card shows live entry list (up to 8), completion bar, top-tag + consistency from `journalSnapshot`, links to workspace.

## Phase 4 — Public chart + journal (done in code)

- **`Layout` auth:** `/chart` and `/journal` are **public** (no redirect to `/home` when logged out), matching localStorage journal/notes and anon-friendly engine chart path.

## Phase 5 — Per-user cloud persistence (Supabase)

- **Migration:** `supabase/migrations/20260429180000_user_notes_journal.sql` — `user_trading_notes`, `user_journal_entries` with RLS (`authenticated`, own `user_id` only).
- **Client:** `src/lib/userWorkspaceCloud.ts` — `load*Hybrid` / `saveNoteHybrid` / `createNoteHybrid` / `deleteNoteHybrid` / `insertJournalHybrid` / `deleteJournalHybrid`. Logged-in users read/write Supabase; guests keep `localStorage`.
- **First login:** one-shot migration (`sessionStorage` flag per user) copies local notes/journal into Supabase, then clears local keys so data is not duplicated.
- **UI:** `JournalWorkspace` + MAIN journal strip use hybrid loaders; banner explains sync vs local-only.

### Next (not done here)

- **Watchlist groups + active symbol + UI prefs** in a single `user_workspace_preferences` row or reuse `profiles` JSON — same RLS pattern.
- **R2 / large blobs** only if you later store files (screenshots, exports); text fits Postgres fine.

## Later phases (reference only)

- **Phase 6+:** MT5 / execution, remaining domains in table, etc.
