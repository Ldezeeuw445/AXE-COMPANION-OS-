# Deploy AXE Companion on the IONOS VPS

Production is `www.axecompanion.com` — Ubuntu + nginx → Next on port 5000.
This script is the only ship path.

## Ship a branch (run on the server)

SSH into `212.227.91.79`, then:

```bash
cd /path/to/AXE-COMPANION-OS-
./scripts/deploy-vps.sh cursor/chart-websocket-live-c844
```

After this branch is on `main`:

```bash
./scripts/deploy-vps.sh main
```

That fetches the ref, `npm ci`, `npm run build`, and restarts via pm2/systemd when those names exist.

Deploy does **not** happen from GitHub. The live site only updates when someone runs the script on that machine.

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

## Host cron

Install `scripts/vps.crontab` on the box (replace `APP_ROOT`) and keep `CRON_SECRET` in `.env.local`.

## Check on the phone

1. Hard-refresh or close and reopen the PWA.
2. Open Chart on an MT5 cloud account.
3. The compact overlay badge should read **WS**, not **SSE**.

If it still says SSE: confirm nginx Upgrade headers, then `ss -tlnp | grep 5000` and that the running Next process is this branch (`git log -1 --oneline`).

## Rollback

On the VPS:

```bash
./scripts/deploy-vps.sh main
```

(or the previous known-good commit). SSE `/api/chart/live` stays as the safety net if the socket cannot upgrade.

## Leftover dashboard steps (Luka only)

These cannot be changed from this repo:

1. **GitHub repo homepage.** Settings → General → Website is still `https://axe-companion-os.vercel.app`. Set it to `https://www.axecompanion.com`.
2. **Vercel GitHub App.** Disconnect it at GitHub → repo Settings → Integrations → Vercel. Leftover checks ("Account is blocked") come from that old link and can block PRs.
3. **Vercel dashboard.** Archive or delete the old Companion project if it still exists. Only Luka can do that in the Vercel account.
