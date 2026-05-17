# AXE Companion Production Runtime Flow

Launch posture: AXE Companion is the mobile/operator app. Supabase is account truth, Vercel runs the Next.js app and server actions, Supabase Edge Functions handle provider/runtime proxy work, and Cloudflare `chart-edge` powers the preferred chart WebSocket path.

## Runtime Flow

1. User signs in through the Next app.
2. Server loaders/actions read user-owned rows through Supabase RLS.
3. MT5 cloud accounts are provisioned server-side through MetaAPI.
4. Chart loads initial broker candles from server-side MetaAPI calls.
5. Live chart tries Cloudflare WebSocket first, then Next SSE, then keeps the last stable broker state visible.
6. AXE chat builds a compact context summary from accounts, chart, trades/journal, intel, market, alerts, memory and health state.

## MT5 Onboarding And Recovery

- Required user inputs: MT5 numeric login, exact MT5 server name, investor/read-only password, MetaAPI region.
- Passwords are sent once to MetaAPI over TLS and are not stored in Supabase or the browser.
- After connect, the account may remain `provisioning` while MetaAPI deploys the cloud terminal.
- Recovery order in the UI:
  1. **Test** confirms credentials/server/account-information.
  2. **Sync** pulls account history into `broker_trades`.
  3. **Doctor** checks deployment, terminal, broker data, positions, history, live prices and live-trading state.

## Provider And Runtime Health

- Accounts page summarizes Supabase account truth, MetaAPI cloud linkage, recovery blockers and sync freshness.
- Intel page summarizes provider/source health and cache/stale state.
- Chart status uses honest state labels:
  - `WS live` for Cloudflare WebSocket.
  - `SSE fallback` for the Next SSE path.
  - `Recovering` while reconnecting.
  - `Stale feed` when live data has paused but the last stable chart remains useful.
  - `Cached` when realtime is unavailable and broker candles are preserved.

## Hardening Rules

- No provider keys in frontend code.
- Do not replace MetaAPI, Cloudflare chart-edge or SSE contracts during polish work.
- Keep degraded paths responsive: partial context, cached candles and stale summaries are better than blocked screens.
- Use timeouts around external provider calls and return partial data where possible.
- Store only sanitized operational summaries in Supabase metadata.
