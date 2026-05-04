# axe-chart-edge — Cloudflare realtime layer

Cloudflare Worker + Durable Object that fans out the AXE Companion chart
websocket. Lives at the edge; the Next app issues short-lived signed tokens
(HS256) so this worker never speaks to Supabase.

## Routes

- `GET  /health` — liveness check.
- `GET  /ws/chart?account=…&symbol=…&tf=…&token=<JWT>` — websocket upgrade.
  Token is verified against `CHART_SESSION_JWT_SECRET`. URL params must match
  the token's payload; otherwise 401.
- `POST /internal/publish` — optional. Push pre-built events from a Node
  MetaApi streamer. Requires `STREAMER_SECRET` and a matching
  `X-Streamer-Secret` header.

## Local dev

```bash
cd cloudflare/chart-edge
npm install
npx wrangler secret put CHART_SESSION_JWT_SECRET
npx wrangler secret put METAAPI_TOKEN
npm run dev
```

## Deploy

```bash
cd cloudflare/chart-edge
npm run deploy
```

Then in the Next app set `NEXT_PUBLIC_CHART_WS_URL` to the deployed worker URL,
e.g. `wss://chart.axecompanion.com/ws/chart`. The same
`CHART_SESSION_JWT_SECRET` must be set on Vercel.

## Honest scope today

- The Durable Object polls MetaApi REST (current-price, last candle, positions)
  on a single shared loop per room. Same shape as the SSE fallback.
- The official MetaApi socket.io SDK is Node-only and is not pulled in here.
  Production hardening: deploy a Node streamer that subscribes via the SDK and
  POSTs `tick` / `candle_update` / `positions_update` to `/internal/publish`.
  The frontend contract does not change.
