# Trading OS — technische audit

**Datum:** 29 april 2026  
**Scope:** hele monorepo (Vite React-app, Supabase Edge Functions, optioneel Cloudflare live-engine).  
**Methodologie:** statische verificatie (build, ESLint-rapport), code- en routevergelijking met `PAGE_DATA_MATRIX` in `src/lib/dataEngineMatrices.ts`, en expliciete grenzen: **geen productie-browser smoke-test vanuit deze omgeving** (die blijft bij jou lokaal).

---

## 1. Executive summary

De applicatie **bouwt succesvol** (`npm run build`: TypeScript project references + Vite production build). **ESLint slaagt repo-breed niet** (grote hoeveelheid bestaande issues in o.a. `supabase/functions`, `InteractiveMap`, `PolymarketIntel`, `AiChatWindow`); dat is een **kwaliteits- en CI-risico**, niet per se een runtime-blokker voor lokale dev.

**Data:** Ingelogde gebruikers kunnen notities, journal, en (na migratie) **workspace-voorkeuren** via Supabase synchroniseren met RLS. Gasten vallen terug op `localStorage` en publieke routes waar dat is toegestaan.

**Engine:** Chart en een groot deel van de terminal gebruiken de engine-adapter + Edge `engine-proxy` / `intel-proxy`; meerdere pagina’s zijn bewust **stub of gemengd** (zie matrix).

---

## 2. Uitgevoerde checks (bewijs)

| Check | Uitkomst |
|--------|-----------|
| `npm run build` | **Geslaagd** — `tsc -b` + `vite build`, output onder `dist/`. |
| `npm run lint` (`eslint .`) | **Niet geslaagd** — ca. **200+ errors** (o.a. `@typescript-eslint/no-explicit-any`, `react-hooks/purity`, `react-hooks/refs`, `no-unsafe-finally`). Nieuwe bestanden in deze sessie (`userPreferencesCloud.ts`, `WorkspacePreferencesSync.tsx`, `SymbolContext`-uitbreiding) hebben **geen IDE-linterfouten** in de gecontroleerde paden. |
| Browser E2E | **Niet uitgevoerd** in deze audit-omgeving. |

---

## 3. Authenticatie en routing

- **Layout-gate** (`src/components/Layout.tsx`): zonder `userId` wordt doorgestuurd naar `/home`, behalve voor: `/home`, `/auth`, `/onboarding`, `/chart`, `/journal`.
- **Publiek zonder login:** home, auth-flow, chart, journal (zoals bedoeld in het completion-plan).
- **Session:** `useSupabaseSession` (`src/lib/supabaseAuth.ts`) — client vereist `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` wanneer cloud-features actief zijn.

---

## 4. Persistentie (wat waar landt)

| Onderdeel | Gast (geen auth) | Ingelogd + Supabase geconfigureerd |
|-----------|------------------|-------------------------------------|
| Watchlist-groepen | `localStorage` (`watchlistDefaults`) | **+** rij `user_workspace_preferences.watchlist_groups` (debounced upsert na pull) |
| Actief symbool + recents | `localStorage` | **+**zelfde tabel (`active_symbol`, `recent_symbols`) |
| Beginner mode | `localStorage` (`tos_beginner`) | **+**zelfde tabel (`beginner_mode`), éénrichtingssync via `setBeginner` |
| Notes + journal | `localStorage` | Hybrid: `userWorkspaceCloud.ts` → `user_trading_notes`, `user_journal_entries` + eenmalige migratie uit local |

**Migraties (Supabase SQL):**

- `supabase/migrations/20260429180000_user_notes_journal.sql` — notes + journal.  
- `supabase/migrations/20260429190000_user_workspace_preferences.sql` — workspace prefs.

Zonder deze tabellen in jouw project geven client-upserts **fouten** (console warnings in `WorkspacePreferencesSync` / journal flows).

---

## 5. Pagina’s vs. data-engine (matrix)

De canonieke lijst staat in **`PAGE_DATA_MATRIX`** (`src/lib/dataEngineMatrices.ts`), inclusief `ENGINE_PROXY_SECRETS` / `INTEL_PROXY_SECRETS` / `VITE_CLIENT_ENV` (alleen **namen**, geen geheimen).

**Kort overzicht:**

- **Live / overwegend live:** Chart/TradingTerminal, MacroTerminal, MarketScanner, EarningsCalendar, EngineOps, AxeCompanion (data-paden), delen van News/Heatmap/Intel/Main dashboard afhankelijk van secrets en engine-responses.
- **Mixed:** News (contextrails deels stub), Heatmap (seed tot scanner data), Intel (jets/vessels vs. legacy/stub-onderdelen), Polymarket (zoeken live Gamma; KPI/watchlist demo), Main dashboard (engine-hooks + veel statische UI).
- **Stub / placeholder:** QuantLab (`runBacktest` synthetisch), Analyses (`StubAnalysesDataSource`), AiDataCenterMap (placeholder dataset), BigMac (embed).

**Opmerking:** De matrix is een **intentie- en architectuurdocument**; echte “live” status hangt af van geïmplementeerde Edge-secrets en externe API’s in jouw deployment.

---

## 6. Bekende TODO’s / placeholders (steekproef)

Zie ook grep op `TODO` / `PLACEHOLDER` in `src/`. Voorbeelden:

- `engineAdapterLegacy.ts` — dark pool, Polymarket list, data centers-tabel, Senate watcher, squawk RSS, backtest worker (allemaal gemarkeerd als placeholder/TODO).
- UI: GlobalTopBar (accountfilter, display currency), MobileBottomNav (chat), AxeCompanion (download modal), AiChatWindow (bijlage, voice).

---

## 7. Wat **jij** nog handmatig moet doen

1. **Supabase migraties toepassen** op het project dat bij jouw `VITE_SUPABASE_*` hoort:  
   `20260429180000_user_notes_journal.sql` en `20260429190000_user_workspace_preferences.sql` (CLI `supabase db push` / link + push, of plakken in SQL Editor).
2. **Edge Functions deployen** en secrets zetten zoals in `dataEngineMatrices.ts` / interne docs — minimaal wat je voor chart/news/scanner/intel gebruikt.
3. **Client-env:** `.env` / Vercel / hosting met `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, en eventueel `VITE_ENGINE_PROXY_URL`, `VITE_LIVE_ENGINE_WS_URL`, enz. volgens jouw setup.
4. **Handmatige QA in de browser** (kort checklist):
   - Gast: `/chart`, `/journal` bereikbaar; geen redirect naar `/home`.
   - Login: navigatie naar `/`; watchlist wijzigen → na ~1–2 s geen errors in console; andere tab of refresh → voorkeuren terug (na migratie).
   - Journal/notes: item aanmaken → refresh → data behouden (cloud).
   - `/engine`: proof-rijen en status zoals verwacht met jouw secrets.
5. **Lint/CI (optioneel maar aanbevolen):** ESLint-fouten afbouwen of scope verkleinen (bijv. alleen `src/` in CI) zodat `npm run lint` betekenisvol groen kan worden.

---

## 8. Conclusie

De codebase is **buildbaar en deploybaar** vanuit TypeScript/Vite-perspectief. **Kwaliteit:** ESLint is op repo-niveau rood; plan daar apart werk voor. **Functionaliteit:** core-terminal, engine-koppelingen en cloud-hybrid flows zijn in code aanwezig; **productie-gedrag** moet je valideren met echte Supabase-data, migraties en API-keys in de browser.
