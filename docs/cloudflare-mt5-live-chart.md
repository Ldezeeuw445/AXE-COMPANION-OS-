# Cloudflare MT5 live chart

Realtime chart architecture for AXE Companion. MT5 stays the broker truth;
the IONOS Next process serves same-origin `/ws/chart`; Cloudflare chart-edge
is optional; Supabase remains auth and account truth.

## Layout

```
AXE Companion (Next)
  → POST /api/chart/session     (mints HS256 chart token)
  → 1) wss://<this-host>/ws/chart   (same-origin Node gateway — default)
  → 2) wss://chart.<domain>/ws/chart (optional Cloudflare ChartLiveRoom)
       │
       │  Cloudflare Worker (optional)
       │   → ChartLiveRoom (Durable Object)
       │       │
       │       ├──  Mode A (poll): DO polls MetaApi REST
       │       └──  Mode B (push): Node MetaApi streamer → /internal/publish
       │
       └──  Browser (useLiveChart)
             tries WS first (same-origin, then Cloudflare), then /api/chart/live SSE
```

The chart should show **WS**, not **SSE**. SSE is only the safety net.

## Why a same-origin socket?

Production often never set `NEXT_PUBLIC_CHART_WS_URL`, so `/api/chart/session`
returned `wsUrl: null` and the chart stayed on SSE forever. `next start`
now serves `/ws/chart` on the same host. Nginx (or Cloudflare in front of
Next) must forward the HTTP Upgrade:

```
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

## Why a separate Cloudflare Worker?

- WebSocket-first: durable, browser-friendly, push-based.
- Per-room state: one `ChartLiveRoom` per
  `userId | accountId | brokerSymbol | timeframe`.
- One MetaApi REST loop per room — multiple devices/tabs share one upstream.
- Edge-local: optional extra hop in front of the IONOS Next process.

## Honest constraint

The official MetaApi socket.io SDK is Node-only. It is not safe to embed in a
Workers runtime. Mode A keeps the system production-runnable today by polling
REST. Mode B is the upgrade path: deploy a tiny Node streamer once, point
`STREAMER_SECRET` at the Worker, and the same browser hook keeps working.

## Event contract

Defined in `src/lib/chart/liveContract.ts`. Both the SSE route and the Worker
emit the same shape. The browser parses one set of events:

- `ready`
- `tick`
- `candle_update`
- `positions_update`
- `live_status` — `live | delayed | reconnecting | offline | error`
- `heartbeat`
- `error`

## Auth — short-lived JWT

`POST /api/chart/session` returns:

```json
{ "token": "<HS256 JWT>", "wsUrl": "wss://www.axecompanion.com/ws/chart", "fallbackWsUrl": "wss://chart.axecompanion.com/ws/chart", "expiresIn": 120 }
```

The token's payload includes `userId`, `accountId`, `metaApiAccountId`,
`displaySymbol`, `brokerSymbol`, `timeframe`, `iat`, `exp`. The Worker
verifies signature and rejects when URL params don't match the token.

When a token cannot be signed, the Next API returns `wsUrl: null` and the
frontend falls back to SSE. Same-origin `/ws/chart` does not require
`NEXT_PUBLIC_CHART_WS_URL`.

## Frontend transport selection

`useLiveChart` does:

1. Try same-origin `/ws/chart`, then an explicit Cloudflare URL if configured.
2. On failure → `/api/chart/live` SSE, and keep retrying WS so the badge can
   upgrade from SSE to WS.
3. If both unavailable → `offline`. Static REST candles stay visible.

UI status pill labels:

- `LIVE STREAM`
- `DELAYED POLLING`
- `RECONNECTING`
- `OFFLINE`
- `FAILED`

## Required secrets

IONOS Next (`.env.local` on the VPS):

- `CHART_SESSION_JWT_SECRET` — HS256 secret; also set on Cloudflare if that worker is used. Same-origin `/ws/chart` works without Cloudflare.
- `NEXT_PUBLIC_CHART_WS_URL` — only if using Cloudflare chart-edge (`wss://chart.<domain>/ws/chart`).
- `METAAPI_TOKEN` — server-only.
- Existing Supabase env.

Cloudflare:

- `CHART_SESSION_JWT_SECRET`
- `METAAPI_TOKEN`
- `METAAPI_CLIENT_API_URL` and `METAAPI_MARKET_DATA_URL` (vars, not secrets).
- `STREAMER_SECRET` — only when wiring Mode B.
- `ALLOWED_ORIGINS` — `https://app.example.com`.

Never store these in the repo.

## Deploy

1. `cd cloudflare/chart-edge`
2. `npm install`
3. `npx wrangler secret put CHART_SESSION_JWT_SECRET`
4. `npx wrangler secret put METAAPI_TOKEN`
5. `npm run deploy`
6. On the IONOS host, set `NEXT_PUBLIC_CHART_WS_URL` only if using the worker
   (`wss://chart.<domain>/ws/chart`) and add the matching
   `CHART_SESSION_JWT_SECRET`. Then `./scripts/deploy-vps.sh`. Same-origin
   `/ws/chart` needs no Cloudflare URL.

## Testing

- Health: `curl https://chart.<domain>/health` → `ok`.
- Session: signed in, hit `/api/chart/session` with the chart's account + tf;
  expect `token` and `wsUrl`.
- Stream: connect with the returned token; expect `ready` immediately, then
  periodic `tick` / `candle_update` / `positions_update` events.

## Production hardening

- Deploy the Node streamer in `node/metaapi-streamer/` (uses the official
  MetaApi SDK socket.io). It POSTs `/internal/publish` to this Worker.
- Switch the Worker to `WORKER_MODE = "push"` in `wrangler.toml`. The
  Durable Object then uses the **WebSocket Hibernation API** and stops
  polling MetaApi REST itself. See `cloudflare/chart-edge/src/worker.ts`.
- Resolved broker symbols are already cached in
  `user_broker_accounts.metadata.symbol_map` by the loader, so reconnects skip
  the suffix probe.
- Audit snapshots: apply `supabase/migrations/20260504130000_chart_live_snapshots.sql`
  and let the chart push to `/api/chart/snapshot`. Browser already does this
  every 30s while the stream is live and the tab is visible.
- Mobile UX: when the tab goes hidden, the live stream is disconnected to
  save battery/data; it reconnects on visibility (see `usePageVisible`).
- Configure `ALLOWED_ORIGINS` to your production hostnames.
- See `docs/chart-edge-deploy-runbook.md` for the full step-by-step.
