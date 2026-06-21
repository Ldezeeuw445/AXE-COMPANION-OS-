# Engine v2 Edge Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the full Engine v2 data layer (News, Macro, Chart, Scanner, Axe, Account, Dashboard) work end-to-end through `engine-proxy` with multi-key routing, caching, retries, and graceful fallbacks so the terminal “just works”.

**Architecture:** Browser UI calls `getTradingAdapter()` (local engine for dev or `RemoteEngineAdapter` → Supabase Edge `engine-proxy` for production). Edge runs `createEngine()` with server-side secrets and exposes a stable action-based API. Intel stays on `intel-proxy` but gains multi-key support and “live vs fallback” visibility.

**Tech Stack:** Vite + React, Supabase Edge Functions (Deno), `@supabase/supabase-js`, Engine v2 modules under `src/engine/*`.

---

## File map (what changes where)

- Modify: `src/lib/engineAdapterLegacy.ts`
  - Route “engine domains” functions to `getTradingAdapter()` (and only fall back to mock when needed).
  - Track per-feed “edge success” so UI can show accurate LIVE/DEMO/SNAPSHOT.
- Modify: `src/lib/engineAdapter.ts`
  - Ensure pages importing from `../lib/engineAdapter` get the routed implementations (no page-by-page rewrite required).
- Modify: `supabase/functions/engine-proxy/index.ts`
  - Confirm all `TradingAdapterFacade` actions are supported (already mostly done).
  - Add a lightweight `health`/`version` action for debugging client ↔ edge wiring.
- Modify: `supabase/functions/intel-proxy/index.ts`
  - Add multi-key parsing for `AISSTREAM_API_KEYS` + numbered keys, rotate keys on failure.
  - (Optional) add `WHALEALERT_API_KEYS` support if/when multiple keys exist.
- Modify: `src/pages/Intel.tsx`
  - Use dynamic LIVE status based on actual edge call success (already started); keep robust on empty responses.

## Verification commands

- Run: `npm run build`
- Run: `npm run lint`
- (Manual) In browser while signed in: open pages for News/Macro/Chart/Scanner/Axe/Account/Dashboard and confirm no “mock-only” behavior when `VITE_USE_ENGINE_EDGE=true`.

---

### Task 1: Wire legacy “engine domain” helpers to Engine v2 adapter

**Files:**
- Modify: `src/lib/engineAdapterLegacy.ts`
- Modify: `src/lib/engineAdapter.ts`

- [ ] **Step 1: Identify which exported functions represent engine domains**
  - Search in `src/lib/engineAdapterLegacy.ts` for exports used by pages:
    - News: `news(...)`, `squawkHeadlines(...)`
    - Macro: `macroSeries(...)` (and any macro list helper)
    - Chart: `candles(...)` / `chart(...)` / `quote(...)` (where applicable)
    - Scanner: `scanner(...)` / `scannerResults(...)`
    - Axe: `axe*` helpers
    - Account: `getAccountSummary`, `getOpenPositions`, `getWatchlist` (if present)

- [ ] **Step 2: Add a single internal helper**

```ts
import { getTradingAdapter } from './engineAdapter';

async function tryEngine<T>(fn: (a: ReturnType<typeof getTradingAdapter>) => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
  try {
    const adapter = getTradingAdapter();
    const value = await fn(adapter);
    return { ok: true, value };
  } catch {
    return { ok: false };
  }
}
```

- [ ] **Step 3: Update each engine-domain export to prefer engine adapter**
  - Pattern:
    - If edge/local engine succeeds → return real data
    - Else → return existing mock/stub

- [ ] **Step 4: Verify no page imports need changing**
  - `src/pages/*` already imports from `../lib/engineAdapter` in many places; since `src/lib/engineAdapter.ts` re-exports legacy helpers, once legacy helpers call `getTradingAdapter()` the whole app benefits.

- [ ] **Step 5: Verify**
  - Run: `npm run build`
  - Run: `npm run lint`

---

### Task 2: Add `engine-proxy` debug action for quick wiring checks

**Files:**
- Modify: `supabase/functions/engine-proxy/index.ts`
- Modify (optional): `src/lib/remoteEngineAdapter.ts` (dev-only helper)

- [ ] **Step 1: Add `ping` action**

```ts
case 'ping':
  data = { ok: true, ts: new Date().toISOString() }
  break
```

- [ ] **Step 2: (Optional) Add a `getProviderStatus` action**
  - If EngineAdapter already has `getDashboard/getEngineStatus`, this can be skipped.

- [ ] **Step 3: Verify**
  - Run: `npm run bundle:engine-edge`
  - Deploy `engine-proxy` (Dashboard)
  - From browser console (signed in), call:
    - `await (new (await import('/src/lib/remoteEngineAdapter.ts')).RemoteEngineAdapter()).['invoke']('ping', {})`

---

### Task 3: Intel multi-key routing for AISStream (vessel)

**Files:**
- Modify: `supabase/functions/intel-proxy/index.ts`

- [ ] **Step 1: Add `parseKeyList` usage for AISStream**

```ts
const aisKeys = parseKeyList(env, { listName: 'AISSTREAM_API_KEYS', singleName: 'AISSTREAM_API_KEY', numberedPrefix: 'AISSTREAM_API_KEY_' })
```

- [ ] **Step 2: Try keys in order (or round-robin)**
  - For each key:
    - open ws
    - collect short snapshot
    - if any valid events parsed → return mapped vessels/alerts
  - On ws error → try next key

- [ ] **Step 3: Verify**
  - Deploy `intel-proxy`
  - Set secrets: `AISSTREAM_API_KEY_1`, `AISSTREAM_API_KEY_2`
  - Confirm vessel card shows LIVE even if vessel list is occasionally empty (edge call success).

---

### Task 4: Finish “LIVE status” semantics in Intel UI

**Files:**
- Modify: `src/lib/engineAdapterLegacy.ts`
- Modify: `src/pages/Intel.tsx`

- [ ] **Step 1: Ensure “live” toggles are set on successful edge calls, not “non-empty data”**
  - Live == edge call succeeded and returned a correctly-shaped payload.

- [ ] **Step 2: Keep fallback behavior unchanged**
  - If edge fails or missing token → fallback to stub and mark live=false.

- [ ] **Step 3: Verify**
  - Run: `npm run build`
  - Open Intel page and verify: with edge enabled you see LIVE even if list is empty; if you sign out you see DEMO.

---

## Self-review checklist (run after writing code)

- [ ] No UI component imports provider SDKs directly (only uses `getTradingAdapter()`/helpers).
- [ ] Edge functions never require browser-only APIs.
- [ ] All secrets are server-side (`SUPABASE_*`, `FMP_*`, `FRED_*`, `POLYGON_*`, `TWELVEDATA_*`, `OPENAI_*`, `AISSTREAM_*`, etc.).
- [ ] `npm run build` and `npm run lint` pass.

