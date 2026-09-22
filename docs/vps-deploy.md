# Deploy AXE Companion on the IONOS VPS

Production is `www.axecompanion.com` — Ubuntu + nginx → Next on port 5000.
**Do not use Vercel.** There is no Vercel production, and there will not be one.

## Ship a branch (run on the server)

SSH into the IONOS box, then:

```bash
cd /path/to/AXE-COMPANION-OS-
./scripts/deploy-vps.sh cursor/chart-websocket-live-c844
```

After this branch is on `main`:

```bash
./scripts/deploy-vps.sh main
```

That fetches the ref, `npm ci`, `npm run build`, and restarts via pm2/systemd when those names exist.

This agent cannot SSH into `212.227.91.79` (no key). The live site only updates when someone runs the script on that machine.

## nginx must upgrade WebSockets

Without this, the chart stays on SSE. Put the map in the `http` block, then proxy Next:

```
map $http_upgrade $connection_upgrade {
  default upgrade;
  ''      close;
}

server {
  # ... existing TLS / server_name www.axecompanion.com ...

  location / {
    proxy_pass http://127.0.0.1:5000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_set_header X-Forwarded-For $http_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 86400;
  }

  location /ws/chart {
    proxy_pass http://127.0.0.1:5000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_set_header X-Forwarded-For $http_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 86400;
  }
}
```

Then `sudo nginx -t && sudo systemctl reload nginx`.

Same-origin chart WS is `wss://www.axecompanion.com/ws/chart`. You do **not** need `NEXT_PUBLIC_CHART_WS_URL` unless you also run Cloudflare `axe-chart-edge`.

## Host cron (replaces Vercel Cron)

`vercel.json` schedules are leftover documentation only — they do not run. Install `scripts/vps.crontab` on the box (replace `APP_ROOT`) and keep `CRON_SECRET` in `.env.local`.

## Check on the phone

Open Chart on an MT5 account. Hard-refresh / reopen the PWA. The compact badge should read **WS**, not **SSE**.

## Install dependencies with npm 10

The VPS runs Node 22 / npm 10 and deploys with `npm ci`, which refuses a tree
that does not match the lock. npm 11 (Node 24) writes a lock without entries
npm 10 expects — `@base-org/account`, `ox`, `zustand` and the rest of the wagmi
tree — and the deploy then stops at install, before the build. If your machine
runs npm 11, add packages with:

```bash
npx npm@10.9.8 install <pkg>
npx npm@10.9.8 ci   # verify the lock the way the VPS will
```
