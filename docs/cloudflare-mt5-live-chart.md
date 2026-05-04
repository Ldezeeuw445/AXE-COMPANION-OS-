# Cloudflare MT5 live chart

Realtime chart architecture for AXE Companion. MT5 stays the broker truth;
Cloudflare is the realtime edge; Supabase remains auth and account truth;
Next/Vercel renders the UI.

## Layout

```
AXE Companion (Next)
  → POST /api/chart/session     (mints HS256 chart token)
  → wss://chart.<domain>/ws/chart?token=…&account=…&symbol=…&tf=…
       │
       │  Cloudflare Worker
       │   → ChartLiveRoom (Durable Object)
       │       │
       │       ├──  Mode A (current default):
       │       │     DO polls MetaApi REST
       │       │       (current-price, candle, positions)
       │       │
       │       └──  Mode B (production hardening):
       │             Node MetaApi streamer
       │               connects to MetaApi socket.io
       │               POST /internal/publish (HMAC X-Streamer-Secret)
       │
       └──  Browser (useLiveChart hook)
             tries WS first, falls back to /api/chart/live SSE
```

## Why a separate Worker?

- WebSocket-first: durable, browser-friendly, push-based.
- Per-room state: one `ChartLiveRoom` per
  `userId | accountId | brokerSymbol | timeframe`.
- One MetaApi REST loop per room — multiple devices/tabs share one upstream.
- Edge-local: lower latency than Vercel functions in many regions.

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
{ "token": "<HS256 JWT>", "wsUrl": "wss://chart.example.com/ws/chart", "expiresIn": 120 }
```

The token's payload includes `userId`, `accountId`, `metaApiAccountId`,
`displaySymbol`, `brokerSymbol`, `timeframe`, `iat`, `exp`. The Worker
verifies signature and rejects when URL params don't match the token.

When `CHART_SESSION_JWT_SECRET` or `NEXT_PUBLIC_CHART_WS_URL` is unset, the
Next API returns `wsUrl: null`. The frontend falls back to SSE automatically.

## Frontend transport selection

`useLiveChart` does:

1. Try WS using the session token if `wsUrl` is set.
2. On failure or close → fall back to `/api/chart/live` SSE.
3. If both unavailable → `offline`. Static REST candles stay visible.

UI status pill labels:

- `LIVE STREAM`
- `DELAYED POLLING`
- `RECONNECTING`
- `OFFLINE`
- `FAILED`

## Required secrets

Vercel (Next):

- `CHART_SESSION_JWT_SECRET` — HS256 secret, also set on Cloudflare.
- `NEXT_PUBLIC_CHART_WS_URL` — `wss://chart.<domain>/ws/chart`.
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
6. On Vercel, set `NEXT_PUBLIC_CHART_WS_URL` to the worker URL plus `/ws/chart`
   and add the matching `CHART_SESSION_JWT_SECRET`. Redeploy.

## Testing

- Health: `curl https://chart.<domain>/health` → `ok`.
- Session: signed in, hit `/api/chart/session` with the chart's account + tf;
  expect `token` and `wsUrl`.
- Stream: connect with the returned token; expect `ready` immediately, then
  periodic `tick` / `candle_update` / `positions_update` events.

## Production hardening

- Deploy a Node streamer that uses the official MetaApi SDK and POSTs
  `/internal/publish`. The DO becomes a pure fan-out room — REST polling can
  be disabled.
- Move logic to WebSocket Hibernation API once the polling loop has been
  replaced by streamer push (timers prevent hibernation).
- Persist resolved broker symbols in `user_broker_accounts.metadata.symbol_map`
  so resolution is cached across reconnects (already implemented in the loader).
- Configure `ALLOWED_ORIGINS` to your production hostnames.
