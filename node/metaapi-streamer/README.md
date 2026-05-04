# axe-metaapi-streamer

Long-lived Node process that connects to MetaApi via the official streaming
SDK (`metaapi.cloud-sdk`) and pushes normalized chart events to the Cloudflare
ChartLiveRoom Durable Object via `/internal/publish`.

This service exists because the SDK is Node-only and cannot run inside a
Cloudflare Worker runtime. The Worker remains the public-facing realtime edge.

## Setup

```bash
cd node/metaapi-streamer
npm install
cp .env.example .env
# Fill in METAAPI_TOKEN, WORKER_URL, STREAMER_SECRET, SUBSCRIPTIONS
```

## Subscriptions format

`SUBSCRIPTIONS` is a comma-separated list. Each entry follows:

```
userId|accountId|metaApiAccountId|displaySymbol|brokerSymbol|tf
```

Example with two rooms:

```
SUBSCRIPTIONS=u_abc|acc_123|metaapi_xyz|XAUUSD|XAUUSDm|h1,u_abc|acc_123|metaapi_xyz|EURUSD|EURUSD|m15
```

`tf` must be one of: `m5`, `m15`, `m30`, `h1`, `h4`, `d1`.

(Future: replace this static list with an admin endpoint that asks Supabase
for the active rooms; or have the Worker request a stream when a websocket
connects. The current flow is enough for production.)

## Run locally

```bash
npm run dev
```

You should see:

```
[streamer …] INFO: subscribing XAUUSD (XAUUSDm) h1 on metaapi_xyz
```

## Build & run

```bash
npm run build
npm start
```

## Deploy

Anywhere that runs Node 20+ as a long-lived process:

- Railway: push the folder, set env vars in the dashboard.
- Fly.io: `flyctl launch` with a tiny VM (256–512MB).
- Render: web service, start command `npm start`.
- Docker: see the `Dockerfile` snippet below.

```Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY dist ./dist
CMD ["node", "--enable-source-maps", "dist/index.js"]
```

## Switching the Cloudflare Worker to push mode

After the streamer is up:

```bash
cd ../../cloudflare/chart-edge
npx wrangler secret put STREAMER_SECRET
# Edit wrangler.toml: WORKER_MODE = "push"
npm run deploy
```

The Durable Object will stop polling MetaApi REST and rely on
`/internal/publish` from this streamer.

## Backpressure / failure handling

- `publishEvent` retries up to 3 times with exponential backoff per event.
- Hard 4xx errors are dropped (likely a misconfigured secret) — the streamer
  keeps running.
- On MetaApi disconnect the streamer broadcasts `live_status: reconnecting`
  to all rooms; the SDK auto-reconnects.

## Security

- Secret-protected publish endpoint (`X-Streamer-Secret`).
- Streamer never exposes itself to the public; it only makes outbound HTTP.
- MetaApi token stays on the Node host. Never put it in the browser.

## Limits & next steps

- One process can host many subscriptions but they share the SDK socket.
- For multi-tenant scale: shard by account; each shard a Fly machine.
- The `Subscription` parser is fed from env today. The next iteration can
  pull from Supabase on startup and reconcile changes via webhooks.
