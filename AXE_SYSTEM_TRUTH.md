# AXE System Truth

This file records the verified operational truth for AXE Companion. Treat it as the baseline before changing code.

## Current Product Truth

- AXE Companion is the first launch app.
- AXE Companion is the mobile/operator app in this repo.
- Trading OS is a separate future desktop terminal app and must not be touched from this repo unless explicitly requested.
- Later, Trading OS should connect to the same AXE / Supabase / Edge ecosystem through shared contracts, not direct coupling.

## Git / Branch Truth

- GitHub default branch is `main`. That is also the canonical development and production branch.
- `axe-companion-runtime-foundation` was a long-running launch branch. It was merged into `main` via PR #11 on 2026-07-03 (merge commit `7fa1fd6`).
- Foundation has **no unique commits** that are missing from `main`.
- `main` has later work after that merge: launch polish, chart/alerts hardening, and AXE Core intel sidecar routes.
- New work must branch from `main`, not from `axe-companion-runtime-foundation`.
- Production deploys from `main` on Vercel.
- GitHub Actions (Railway streamer, Supabase functions, migrations) deploy from `main` only.

## Current Runtime Truth

- Production is the IONOS Ubuntu host only (`www.axecompanion.com`, `212.227.91.79`).
- Production website: `www.axecompanion.com` (nginx reverse-proxy → Next `next start` on port 5000).
- Deploy by running `scripts/deploy-vps.sh` **on that box**. Canonical branch is `main`. See `docs/vps-deploy.md`.
- nginx must forward WebSocket upgrades for `/ws/chart`.
- Host cron is `scripts/vps.crontab`. Scheduling also lives in Supabase `pg_cron` + `pg_net` via `axe_ops.dispatch_cron` — see `docs/CRON-RUNBOOK.md`.
- Ollama runs on the same host (`localhost:11434`), which is why chat-health reports it reachable in ~3 ms. One instance serves every user.
- GitHub repo: `Ldezeeuw445/AXE-COMPANION-OS-`
- Current canonical app stack: Next 16 / React 19.
- The app is built as a Next App Router application with server actions, route handlers, server-side services, and client UI.
- Chart live: same-origin `wss://www.axecompanion.com/ws/chart` first, optional Cloudflare `axe-chart-edge`, SSE last.

## Supabase Truth

- One Supabase project intentionally backs all three apps — AXE Companion,
  Trading OS and AXE Core — as the single source of truth. This is a design
  decision, not drift. What it costs is that ownership boundaries have to be
  explicit: `supabase_migrations.schema_migrations` currently holds only AXE
  Core migrations, and Edge functions are deployed from three different local
  paths. Treat schema and function ownership as something to declare, not assume.
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

- Same-origin Next gateway `/ws/chart` is the default live path on the IONOS host.
- Cloudflare worker `axe-chart-edge` is optional (Mode A poll / Mode B streamer push).
- SSE `/api/chart/live` is the safety net only.
- nginx must forward HTTP Upgrade or the phone chart stays on SSE.

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

Corrected 2026-09-07. The earlier claim that lint and `tsc` passed was wrong —
it was read from a shell pipeline whose exit code came from `tail`, not from the
tool. Measured properly:

- `npm run build` passes under Node 22, warning-free.
- `npm run lint` fails: 13 errors, 183 warnings (was 27 errors before this pass).
  The remainder are React Compiler findings in animation components.
- `tsc --noEmit` fails: 57 errors (was 89). `next.config.ts` sets
  `ignoreBuildErrors: true`, so these are suppressed at build time — it is
  load-bearing, not cosmetic. Two of the errors it was hiding were live runtime
  bugs in `/api/risk/band` (fixed 2026-09-07).
- Runtime hang fixes were added for live chart, chart loading, MT5 actions, provisioning polling, Intel proxy calls, market fetches, and Cloudflare chart polling.
- No infinite loader fixes should be reverted.

