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
