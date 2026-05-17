# AXE Companion Spec

AXE Companion launches first as the mobile/operator app. Its job is to be stable, live, private, and useful before any later desktop terminal integration.

## Launch Priorities

1. Stable MT5 account connection
2. Live chart/account data
3. WebSocket/SSE resilience
4. AXE Core context/memory
5. Intel via `intel-proxy`
6. Premium mobile UX polish
7. Vercel/Supabase/Cloudflare deploy stability
8. Trading OS integration later

## Product Boundaries

- AXE Companion is the current app in this repo.
- Trading OS is a separate future desktop terminal app.
- Do not add Trading OS features to this repo unless explicitly requested.
- Future Trading OS integration should happen through clean shared contracts and the same AXE / Supabase / Edge ecosystem.
- Do not directly couple Companion to Trading OS.

## Platform Boundaries

- Next 16 / React 19 is the current canonical app stack.
- Vercel hosts the production Companion app.
- Supabase is the source of truth for auth, database state, Edge Functions, and server-side secrets.
- Cloudflare `axe-chart-edge` powers the current chart live flow.
- Supabase Realtime is currently not publishing app tables.

## Security Boundaries

- No provider API keys in frontend code.
- Supabase / Edge / server secrets are the source of truth for provider and API credentials.
- Browser/client code should call server routes, server actions, Supabase auth-safe APIs, or Edge Functions.
- Provider calls should remain server-side or Edge-side.

## Existing Systems To Preserve

- MT5 / MetaAPI connection and sync logic.
- Cloudflare chart WebSocket / poll flow.
- SSE fallback for chart live data.
- Supabase Edge Functions:
  - `axe-mt5-cloud`
  - `axe-mt5-ingest`
  - `engine-proxy`
  - `intel-proxy`
  - `onboarding-options`
- AXE Core server services:
  - `src/services/axeService.ts`
  - `src/services/chatService.ts`
  - `src/services/contextService.ts`

## Stability Requirement

AXE Companion must not appear frozen because a live, MT5, Intel, or market request stalls. Phase 1 added verified timeout, stale, offline, and fallback behavior. Future work must preserve those protections.

