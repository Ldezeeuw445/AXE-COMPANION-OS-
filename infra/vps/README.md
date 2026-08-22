# Running AXE Companion on the VPS

The app moved off Vercel after the deployment was disabled over billing —
`axecompanion.com` answered `HTTP 402 x-vercel-error: DEPLOYMENT_DISABLED`,
which also blocked the phone, since a TWA is a signed shell around a live URL.

Cloudflare Workers was tried first and hit the free plan's ceiling:

```
Your Worker exceeded the size limit of 3 MiB
.open-next/server-functions/default/handler.mjs — 26332 KiB
```

10 MiB needs a paid plan. The VPS was already paid for, mostly idle
(2.1 of 7.7 GB used, 178 GB free), and runs Node 22 — so it hosts the app
directly, with no size ceiling and no second bill.

## What is on the box

```
~/AXE-COMPANION-OS-              the clone, with .env.local at mode 600
/etc/systemd/system/axe-companion.service    next start -p 5000
/etc/nginx/sites-available/axecompanion.com  proxy :5000, http -> https
/var/log/axe-companion.log       stdout and stderr
```

Both files are copied into this directory so the box is not the only place
they exist. Change them here, then copy up — not the other way round.

## Deploying a change

```bash
ssh api.axecompanion.com
cd ~/AXE-COMPANION-OS- && git pull && npm ci && npm run build
systemctl restart axe-companion
```

## The DNS cutover

Measured 2026-08-22: `axecompanion.com` still resolves to Vercel
(216.198.79.65, 64.29.17.65). The VPS is **212.227.91.79**.

Point the A records for `axecompanion.com` and `www` at the VPS, then issue a
real certificate — until that runs, nginx is loading the `api.` certificate as
a placeholder, so browsers will warn:

```bash
certbot --nginx -d axecompanion.com -d www.axecompanion.com
```

Verify against the site, never a dashboard:

```bash
curl -sI https://axecompanion.com | head -1
```

## Before DNS moves

The vhost already works; it just has no name pointing at it. To see it:

```bash
curl -sk -H "Host: axecompanion.com" https://212.227.91.79/ | grep -o '<title>[^<]*</title>'
```
