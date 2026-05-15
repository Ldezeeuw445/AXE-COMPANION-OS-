# AXE System Truth

This file records the verified operational truth for AXE Companion. Treat it as the baseline before changing code.

## Current Product Truth

- AXE Companion is the first launch app.
- AXE Companion is the mobile/operator app in this repo.
- Trading OS is a separate future desktop terminal app and must not be touched from this repo unless explicitly requested.
- Later, Trading OS should connect to the same AXE / Supabase / Edge ecosystem through shared contracts, not direct coupling.

## Current Runtime Truth

- Production is live on Vercel.
- Website: `www.axecompanion.com`
- GitHub repo: `Ldezeeuw445/AXE-COMPANION-OS-`
- Current canonical app stack: Next 16 / React 19.
- The app is built as a Next App Router application with server actions, route handlers, server-side services, and client UI.

## Supabase Truth

- Supabase project name: `AXE Companion`
- Supabase project ref: `pqnngpcgbdwxavbatbia`
- Supabase / Edge / server secrets are the source of truth for provider and API keys.
- No provider API keys belong in frontend code.
- Supabase Realtime is currently not publishing app tables.

## Existing Supabase Edge Functions

These functions already exist and must be treated as live infrastructure:

- `axe-mt5-cloud`
- `axe-mt5-ingest`
- `engine-proxy`
- `intel-proxy`
- `onboarding-options`

## MT5 / MetaAPI Truth

- MT5 / MetaAPI integration already exists.
- Existing MetaAPI logic must not be rebuilt blindly.
- Current MT5 paths include server-side account connection, sync, test, live chart data, and guarded order flow.
- `axe-mt5-cloud` and `axe-mt5-ingest` exist as Edge Function infrastructure.

## Chart Live Truth

- Cloudflare worker `axe-chart-edge` exists.
- `axe-chart-edge` powers the chart live flow.
- Current chart live system uses Cloudflare WebSocket / poll mode with SSE fallback.
- The live chart path should be stabilized, not replaced without a dedicated audit.

## AXE Core Truth

AXE Core currently exists mostly as server-side services:

- `src/services/axeService.ts`
- `src/services/chatService.ts`
- `src/services/contextService.ts`

These services assemble AXE behavior, chat, context, memory, market context, and user state from server-side sources.

## Intel Truth

- Intel currently flows through `intel-proxy`.
- Provider/API keys for Intel belong in Supabase Edge/server secret scope, not frontend code.

## Phase 1 Stability Truth

Phase 1 runtime stability is complete and verified:

- `npm run lint` passes.
- `npm run build` passes under Node 22.
- `tsc --noEmit` passes.
- Runtime hang fixes were added for live chart, chart loading, MT5 actions, provisioning polling, Intel proxy calls, market fetches, and Cloudflare chart polling.
- No infinite loader fixes should be reverted.

